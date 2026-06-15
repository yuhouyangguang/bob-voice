import request from './request';
import type {
  UploadInitResponse,
  UploadChunkResponse,
  UploadStatusResponse,
  UploadCompleteResponse,
} from '../types';

export const uploadApi = {
  init: async (
    file_name: string,
    total_size: number,
    total_chunks: number
  ): Promise<UploadInitResponse> => {
    const resp = await request.post<UploadInitResponse>('/upload/init', {
      file_name,
      total_size,
      total_chunks,
    });
    return resp.data;
  },

  uploadChunk: async (
    upload_id: string,
    index: number,
    chunk: Blob
  ): Promise<UploadChunkResponse> => {
    const formData = new FormData();
    formData.append('upload_id', upload_id);
    formData.append('index', String(index));
    formData.append('chunk', chunk);

    const resp = await request.post<UploadChunkResponse>('/upload/chunk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return resp.data;
  },

  status: async (upload_id: string): Promise<UploadStatusResponse> => {
    const resp = await request.get<UploadStatusResponse>(`/upload/status/${upload_id}`);
    return resp.data;
  },

  complete: async (upload_id: string): Promise<UploadCompleteResponse> => {
    const resp = await request.post<UploadCompleteResponse>('/upload/complete', { upload_id });
    return resp.data;
  },
};
