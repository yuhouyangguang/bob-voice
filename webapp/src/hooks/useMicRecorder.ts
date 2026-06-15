import { useState, useRef, useCallback } from 'react';

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

interface MicRecorderState {
  recordingState: RecordingState;
  duration: number; // seconds
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
}

interface UseMicRecorderResult {
  state: MicRecorderState;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

export const useMicRecorder = (): UseMicRecorderResult => {
  const [state, setState] = useState<MicRecorderState>({
    recordingState: 'idle',
    duration: 0,
    audioBlob: null,
    audioUrl: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setState((prev) => ({ ...prev, duration: accumulatedRef.current + elapsed }));
    }, 1000);
  }, []);

  const start = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, error: null }));
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      chunksRef.current = [];
      accumulatedRef.current = 0;

      // Prefer webm/ogg format; fall back to whatever browser supports
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const url = URL.createObjectURL(blob);
        setState((prev) => ({
          ...prev,
          recordingState: 'stopped',
          audioBlob: blob,
          audioUrl: url,
        }));
        // Stop all tracks to release mic
        stream.getTracks().forEach((t) => t.stop());
        console.log('[DEBUG] useMicRecorder stopped, blob size=', blob.size);
      };

      recorder.start(1000); // collect data every second
      startTimer();
      setState((prev) => ({ ...prev, recordingState: 'recording', duration: 0 }));
      console.log('[DEBUG] useMicRecorder started recording');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '无法访问麦克风';
      console.error('[DEBUG] useMicRecorder error:', message);
      setState((prev) => ({ ...prev, error: message }));
    }
  }, [startTimer]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      clearTimer();
      accumulatedRef.current = state.duration;
      setState((prev) => ({ ...prev, recordingState: 'paused' }));
      console.log('[DEBUG] useMicRecorder paused');
    }
  }, [clearTimer, state.duration]);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimer();
      setState((prev) => ({ ...prev, recordingState: 'recording' }));
      console.log('[DEBUG] useMicRecorder resumed');
    }
  }, [startTimer]);

  const stop = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      (mediaRecorderRef.current.state === 'recording' ||
        mediaRecorderRef.current.state === 'paused')
    ) {
      mediaRecorderRef.current.stop();
      clearTimer();
      console.log('[DEBUG] useMicRecorder stop called');
    }
  }, [clearTimer]);

  const reset = useCallback(() => {
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }
    clearTimer();
    chunksRef.current = [];
    accumulatedRef.current = 0;
    mediaRecorderRef.current = null;
    setState({
      recordingState: 'idle',
      duration: 0,
      audioBlob: null,
      audioUrl: null,
      error: null,
    });
    console.log('[DEBUG] useMicRecorder reset');
  }, [clearTimer, state.audioUrl]);

  return { state, start, pause, resume, stop, reset };
};
