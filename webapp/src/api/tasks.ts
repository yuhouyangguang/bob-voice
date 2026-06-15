import request from './request';
import type { Task, TaskListResponse, PaginationParams } from '../types';

export const tasksApi = {
  list: async (params?: PaginationParams): Promise<TaskListResponse> => {
    const resp = await request.get<TaskListResponse>('/tasks', { params });
    return resp.data;
  },

  create: async (formData: FormData): Promise<{ task: Task }> => {
    const resp = await request.post<{ task: Task }>('/tasks', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return resp.data;
  },

  get: async (id: number): Promise<{ task: Task }> => {
    const resp = await request.get<{ task: Task }>(`/tasks/${id}`);
    return resp.data;
  },

  delete: async (id: number): Promise<void> => {
    await request.delete(`/tasks/${id}`);
  },

  cancel: async (id: number): Promise<{ task: Task }> => {
    const resp = await request.post<{ task: Task }>(`/tasks/${id}/cancel`);
    return resp.data;
  },

  retry: async (id: number): Promise<void> => {
    await request.post(`/tasks/${id}/retry`);
  },
};
