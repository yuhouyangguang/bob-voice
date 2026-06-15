import request from './request';
import type { Supervision } from '../types';

// Helper to trigger file download from blob response
const downloadBlob = (data: Blob, filename: string) => {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const documentApi = {
  downloadMarkdown: async (taskId: number, filename = 'transcript.md'): Promise<void> => {
    const resp = await request.get(`/tasks/${taskId}/document/markdown`, {
      params: { download: 1 },
      responseType: 'blob',
    });
    downloadBlob(resp.data as Blob, filename);
  },

  generateWord: async (taskId: number): Promise<void> => {
    await request.post(`/tasks/${taskId}/document/word/generate`);
  },

  downloadWord: async (taskId: number, filename = 'transcript.docx'): Promise<void> => {
    const resp = await request.get(`/tasks/${taskId}/document/word`, {
      responseType: 'blob',
    });
    downloadBlob(resp.data as Blob, filename);
  },

  downloadZip: async (taskId: number, filename = 'documents.zip'): Promise<void> => {
    const resp = await request.get(`/tasks/${taskId}/document/zip`, {
      responseType: 'blob',
    });
    downloadBlob(resp.data as Blob, filename);
  },

  downloadJson: async (taskId: number, filename = 'transcript.json'): Promise<void> => {
    const resp = await request.get(`/tasks/${taskId}/document/json`, {
      responseType: 'blob',
    });
    downloadBlob(resp.data as Blob, filename);
  },

  generateSupervision: async (taskId: number): Promise<void> => {
    await request.post(`/tasks/${taskId}/supervision/generate`);
  },

  getSupervision: async (taskId: number): Promise<{ supervision: Supervision }> => {
    const resp = await request.get<{ supervision: Supervision }>(`/tasks/${taskId}/supervision`);
    return resp.data;
  },

  updateSupervision: async (
    taskId: number,
    content_md: string,
    content_json: Record<string, unknown>
  ): Promise<{ supervision: Supervision }> => {
    const resp = await request.put<{ supervision: Supervision }>(`/tasks/${taskId}/supervision`, {
      content_md,
      content_json,
    });
    return resp.data;
  },
};
