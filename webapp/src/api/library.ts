import request from './request';
import type { LibraryItem, Leader } from '../types';

export interface LibrarySearchParams {
  q?: string;
  leader?: string | string[];
  type?: string | string[];
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

export interface LibrarySearchResponse {
  items: LibraryItem[];
  total: number;
  pagination: {
    page: number;
    per_page: number;
    total: number;
    pages: number;
  };
}

export interface LeaderDetail extends Leader {
  recent_meetings: LibraryItem[];
  total_duration: number | null;
}

export interface LeaderSpeech {
  task_id: number;
  meeting_id: number;
  topic: string;
  meeting_at: string | null;
  meeting_type: string;
  segments: import('../types').Segment[];
  document_urls: Record<string, string>;
}

export const libraryApi = {
  search: async (params?: LibrarySearchParams): Promise<LibrarySearchResponse> => {
    const resp = await request.get<LibrarySearchResponse>('/library/search', { params });
    return resp.data;
  },

  getLeaders: async (): Promise<{ leaders: string[]; items: Leader[] }> => {
    const resp = await request.get<{ leaders: string[]; items: Leader[] }>('/library/leaders');
    return resp.data;
  },

  getLeaderDetail: async (id: number): Promise<{ leader: LeaderDetail }> => {
    const resp = await request.get<{ leader: LeaderDetail }>(`/library/leaders/${id}`);
    return resp.data;
  },

  getLeaderSpeeches: async (
    id: number,
    page = 1,
    per_page = 20,
  ): Promise<{ items: LeaderSpeech[]; pagination: LibrarySearchResponse['pagination'] }> => {
    const resp = await request.get<{
      items: LeaderSpeech[];
      pagination: LibrarySearchResponse['pagination'];
    }>(`/library/leaders/${id}/speeches`, { params: { page, per_page } });
    return resp.data;
  },
};
