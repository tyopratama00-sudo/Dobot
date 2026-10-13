import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FilterType } from '../pages/PhotoEditorPage';
import type { SlotTransform } from '../lib/slotTransform';

export interface SaveCompositionInput {
  sessionId: string;
  frameId: string;
  filter: FilterType;
  photoIds: string[];
  /**
   * Zoom/rotate/geser per slot hasil editan user, urut slot & sepanjang
   * photoIds. Dipakai backend agar burst di GIF live dibingkai sama dengan
   * hasil akhir (tanpa ini, burst pakai cover-fit polos → framing-nya loncat
   * saat animasi settle).
   */
  slotTransforms: SlotTransform[];
  composedImage: Blob;
}

// Shape backend response untuk POST /api/photo/compose
// (lihat handlers/photo.go ComposeFrame). Field-field snake_case sesuai
// JSON encoding di backend — api-client interceptor sudah strip wrapper
// `{success, data: ...}` jadi caller pegang langsung object di bawah ini.
export interface CompositionResponse {
  result_id: string;
  download_url: string;
  preview_url: string;
  gif_url: string;
  gif_live_url: string;
  status: string;
  message: string;
}

/**
 * Save composition to backend
 */
export const saveComposition = async (
  input: SaveCompositionInput,
): Promise<CompositionResponse> => {
  const formData = new FormData();
  formData.append('sessionId', input.sessionId);
  formData.append('frameId', input.frameId);
  formData.append('filter', input.filter);
  formData.append('photoIds', JSON.stringify(input.photoIds));
  formData.append('slotTransforms', JSON.stringify(input.slotTransforms));
  formData.append('image', input.composedImage, 'composition.jpg');

  // Note: don't set Content-Type manually — axios/browser will set it
  // with the correct multipart boundary parameter automatically.
  const response = await apiClient.post(`/api/photo/compose`, formData);

  return response.data;
};

/**
 * React Query mutation hook
 */
export const useSaveComposition = () => {
  return useMutation({
    mutationFn: saveComposition,
    onError: (error) => {
      console.error('Failed to save composition:', error);
    },
  });
};
