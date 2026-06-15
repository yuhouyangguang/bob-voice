import request from './request';
import type { LoginResponse, User } from '../types';

export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const resp = await request.post<LoginResponse>('/auth/login', { username, password });
    return resp.data;
  },

  logout: async (): Promise<{ message: string }> => {
    const resp = await request.post<{ message: string }>('/auth/logout');
    return resp.data;
  },

  me: async (): Promise<{ user: User }> => {
    const resp = await request.get<{ user: User }>('/auth/me');
    return resp.data;
  },

  refresh: async (): Promise<void> => {
    await request.post('/auth/refresh');
  },
};
