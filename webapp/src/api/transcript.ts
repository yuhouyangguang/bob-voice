import request from './request';
import type { Segment, TranscriptFormat, TranscriptResponse } from '../types';

export const transcriptApi = {
  get: async (taskId: number, format: TranscriptFormat = 'timeline'): Promise<TranscriptResponse> => {
    const resp = await request.get<TranscriptResponse>(`/tasks/${taskId}/transcript`, {
      params: { format },
    });
    return resp.data;
  },

  updateSegment: async (
    taskId: number,
    segId: number,
    text: string
  ): Promise<{ segment: Segment; corrections: unknown[] }> => {
    const resp = await request.put<{ segment: Segment; corrections: unknown[] }>(
      `/tasks/${taskId}/segments/${segId}`,
      { text }
    );
    return resp.data;
  },

  updateSpeaker: async (
    taskId: number,
    segId: number,
    speaker_label: string
  ): Promise<{ segment: Segment }> => {
    const resp = await request.put<{ segment: Segment }>(
      `/tasks/${taskId}/segments/${segId}/speaker`,
      { speaker_label }
    );
    return resp.data;
  },

  batchUpdateSpeaker: async (
    taskId: number,
    segment_ids: number[],
    speaker_label: string
  ): Promise<{ updated: number }> => {
    const resp = await request.put<{ updated: number }>(
      `/tasks/${taskId}/segments/batch`,
      { segment_ids, speaker_label }
    );
    return resp.data;
  },

  getCorrections: async (taskId: number): Promise<{ corrections: unknown[] }> => {
    const resp = await request.get<{ corrections: unknown[] }>(`/tasks/${taskId}/corrections`);
    return resp.data;
  },
};
