import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TaskProgressEvent } from '../types';
import { useTaskStore } from '../store/taskStore';

interface UseTaskSocketOptions {
  taskId: number | null;
  onProgress?: (event: TaskProgressEvent) => void;
  onError?: (error: unknown) => void;
}

export const useTaskSocket = ({ taskId, onProgress, onError }: UseTaskSocketOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const onProgressRef = useRef(onProgress);
  const onErrorRef = useRef(onError);
  const updateTaskProgress = useTaskStore((state) => state.updateTaskProgress);

  useEffect(() => {
    onProgressRef.current = onProgress;
    onErrorRef.current = onError;
  }, [onProgress, onError]);

  useEffect(() => {
    if (!taskId) return;

    // Connect to /tasks namespace
    const socket = io('/tasks', {
      withCredentials: true,
      transports: ['polling', 'websocket'],  // polling first avoids Vite proxy EPIPE on WS upgrade
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[DEBUG] useTaskSocket connected, subscribing to task ${taskId}`);
      socket.emit('task:subscribe', { task_id: taskId });
    });

    socket.on('task:progress', (event: TaskProgressEvent) => {
      console.log(`[DEBUG] useTaskSocket task:progress`, event);
      updateTaskProgress(event.id, {
        status: event.status,
        progress: event.progress,
        stage: event.stage,
        error_msg: event.error_msg,
      });
      onProgressRef.current?.(event);
    });

    socket.on('task:error', (error: unknown) => {
      console.error('[DEBUG] useTaskSocket task:error', error);
      onErrorRef.current?.(error);
    });

    socket.on('disconnect', (reason: string) => {
      console.log('[DEBUG] useTaskSocket disconnected:', reason);
    });

    socket.on('connect_error', (err: Error) => {
      console.error('[DEBUG] useTaskSocket connect_error:', err.message);
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      console.log('[DEBUG] useTaskSocket disconnected during cleanup');
    };
  }, [taskId, updateTaskProgress]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      console.log('[DEBUG] useTaskSocket manually disconnected');
    }
  }, []);

  return { disconnect };
};
