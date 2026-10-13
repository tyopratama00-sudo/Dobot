import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type Frame, type BackendResponse, normalizeFrame } from './types';
import { type CreateFrameInput } from './createFrame';

export type UpdateFrameInput = Partial<CreateFrameInput>;

export const updateFrame = async ({
  id,
  data,
}: {
  id: string;
  data: UpdateFrameInput;
}): Promise<Frame> => {
  const formData = new FormData();
  if (data.file) formData.append('file', data.file);
  if (data.name) formData.append('name', data.name);
  if (data.category) formData.append('category', data.category);
  if (data.description !== undefined)
    formData.append('description', data.description);
  if (data.status) formData.append('status', data.status);
  if (data.canvasWidth !== undefined)
    formData.append('canvas_width', data.canvasWidth.toString());
  if (data.canvasHeight !== undefined)
    formData.append('canvas_height', data.canvasHeight.toString());
  if (data.slots !== undefined) {
    formData.append('slots', JSON.stringify(data.slots));
    formData.append('photo_slots', data.slots.length.toString());
  }

  const response = await axiosInstance.patch(
    `/api/admin/frames/${id}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  return normalizeFrame(response.data as unknown as BackendResponse);
};

export const useUpdateFrame = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateFrame,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['frames'] });
      queryClient.invalidateQueries({ queryKey: ['frames', variables.id] });
    },
  });
};
