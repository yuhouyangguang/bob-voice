import request from './request';
import type { Correction, AdminUser, AdminStats } from '../types';

export interface CorrectionPayload {
  pattern: string;
  replacement: string;
  category: string;
  is_regex: boolean;
  priority?: number;
  enabled: boolean;
}

export interface UserPayload {
  username?: string;
  password?: string;
  display_name: string;
  email?: string;
  department?: string;
  role: 'user' | 'advanced' | 'admin';
  is_active: boolean;
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  pages: number;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  locked: number;
}

export const adminApi = {
  // ── Corrections ──────────────────────────────────────────────────────────
  getCorrections: async (
    params?: Record<string, string | boolean | number | undefined>
  ): Promise<{ corrections: Correction[]; pagination: Pagination }> => {
    const resp = await request.get('/admin/corrections', { params });
    return resp.data as { corrections: Correction[]; pagination: Pagination };
  },

  createCorrection: async (payload: CorrectionPayload): Promise<{ correction: Correction }> => {
    const resp = await request.post<{ correction: Correction }>('/admin/corrections', payload);
    return resp.data;
  },

  updateCorrection: async (
    id: number,
    payload: Partial<CorrectionPayload>
  ): Promise<{ correction: Correction }> => {
    const resp = await request.put<{ correction: Correction }>(
      `/admin/corrections/${id}`,
      payload
    );
    return resp.data;
  },

  deleteCorrection: async (id: number): Promise<void> => {
    await request.delete(`/admin/corrections/${id}`);
  },

  importCorrections: async (
    file: File
  ): Promise<{ created: number; updated: number; total: number }> => {
    const form = new FormData();
    form.append('file', file);
    const resp = await request.post('/admin/corrections/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return resp.data;
  },

  exportCorrections: async (
    params?: Record<string, string | boolean | undefined>
  ): Promise<Blob> => {
    const resp = await request.get('/admin/corrections/export', {
      params,
      responseType: 'blob',
    });
    return resp.data;
  },

  // ── Users ─────────────────────────────────────────────────────────────────
  getUsers: async (
    params?: Record<string, string | boolean | number | undefined>
  ): Promise<{
    users: AdminUser[];
    pagination: Pagination;
    stats: UserStats;
  }> => {
    const resp = await request.get('/admin/users', { params });
    return resp.data;
  },

  createUser: async (payload: UserPayload): Promise<{ user: AdminUser }> => {
    const resp = await request.post('/admin/users', payload);
    return resp.data;
  },

  updateUser: async (
    id: number,
    payload: Partial<UserPayload>
  ): Promise<{ user: AdminUser }> => {
    const resp = await request.put(`/admin/users/${id}`, payload);
    return resp.data;
  },

  resetUserPassword: async (id: number, password: string): Promise<void> => {
    await request.post(`/admin/users/${id}/reset-password`, { password });
  },

  unlockUser: async (id: number): Promise<{ user: AdminUser }> => {
    const resp = await request.post(`/admin/users/${id}/unlock`);
    return resp.data;
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  getStats: async (): Promise<AdminStats> => {
    const resp = await request.get<AdminStats>('/admin/stats');
    return resp.data;
  },
};
