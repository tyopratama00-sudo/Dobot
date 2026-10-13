import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import {
  type Frame,
  type BackendResponse,
  type FrameStatus,
  type FrameCategory,
  type FrameSlot,
  normalizeFrame,
} from './types';

export type CreateFrameInput = {
  name: string;
  category: FrameCategory | string;
  description?: string;
  status: FrameStatus;
  canvasWidth: number;
  canvasHeight: number;
  slots: Omit<FrameSlot, 'id'>[];
  file?: File;
};

export const createFrame = async (input: CreateFrameInput): Promise<Frame> => {
  const formData = new FormData();
  if (input.file) formData.append('file', input.file);
  formData.append('name', input.name);
  formData.append('category', input.category);
  if (input.description) formData.append('description', input.description);
  formData.append('status', input.status);
  formData.append('canvas_width', input.canvasWidth.toString());
  formData.append('canvas_height', input.canvasHeight.toString());
  formData.append('slots', JSON.stringify(input.slots));
  formData.append('photo_slots', input.slots.length.toString());

  const response = await axiosInstance.post('/api/admin/frames', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return normalizeFrame(response.data as unknown as BackendResponse);
};

export const useCreateFrame = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFrame,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frames'] });
    },
  });
};
