import { axiosInstance } from '@/lib/api-admin';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';

export const deleteFrame = async ({ id }: { id: string }): Promise<void> => {
  await axiosInstance.delete(`/api/admin/frames/${id}`);
};

type UseDeleteFrameOptions = {
  mutationConfig?: UseMutationOptions<void, Error, { id: string }>;
};

export const useDeleteFrame = ({ mutationConfig }: UseDeleteFrameOptions = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...mutationConfig,
    mutationFn: deleteFrame,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['frames'] });
      mutationConfig?.onSuccess?.(...args);
    },
  });
};
