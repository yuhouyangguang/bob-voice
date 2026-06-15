import { useState, useCallback } from 'react';
import { uploadApi } from '../api/upload';

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

interface ChunkedUploadState {
  uploading: boolean;
  progress: number;
  uploadId: string | null;
  error: string | null;
}

interface ChunkedUploadResult {
  state: ChunkedUploadState;
  startUpload: (file: File) => Promise<string | null>;
  reset: () => void;
}

export const useChunkedUpload = (): ChunkedUploadResult => {
  const [state, setState] = useState<ChunkedUploadState>({
    uploading: false,
    progress: 0,
    uploadId: null,
    error: null,
  });

  const reset = useCallback(() => {
    setState({ uploading: false, progress: 0, uploadId: null, error: null });
  }, []);

  const startUpload = useCallback(async (file: File): Promise<string | null> => {
    setState({ uploading: true, progress: 0, uploadId: null, error: null });

    try {
      // Determine chunk size and count
      const totalChunks = Math.ceil(file.size / DEFAULT_CHUNK_SIZE);

      // 1. Initialize upload session
      const initResp = await uploadApi.init(file.name, file.size, totalChunks);
      const { upload_id, chunk_size_recommended } = initResp;
      const chunkSize = chunk_size_recommended ?? DEFAULT_CHUNK_SIZE;

      setState((prev) => ({ ...prev, uploadId: upload_id }));

      // 2. Upload each chunk sequentially
      const actualTotalChunks = Math.ceil(file.size / chunkSize);
      for (let i = 0; i < actualTotalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const chunkResp = await uploadApi.uploadChunk(upload_id, i, chunk);

        const progress = Math.round((chunkResp.received / chunkResp.total) * 95);
        setState((prev) => ({ ...prev, progress }));

        console.log(
          `[DEBUG] useChunkedUpload chunk ${i + 1}/${actualTotalChunks} progress=${progress}%`
        );
      }

      // 3. Complete the upload
      await uploadApi.complete(upload_id);
      setState((prev) => ({ ...prev, uploading: false, progress: 100 }));

      console.log('[DEBUG] useChunkedUpload complete, upload_id=', upload_id);
      return upload_id;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '上传失败';
      console.error('[DEBUG] useChunkedUpload error:', message);
      setState((prev) => ({ ...prev, uploading: false, error: message }));
      return null;
    }
  }, []);

  return { state, startUpload, reset };
};
