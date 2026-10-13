import { axiosInstance } from '@/lib/api-admin';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';

export const deletePackage = async ({ id }: { id: number }): Promise<void> => {
  await axiosInstance.delete(`/api/admin/packages/${id}`);
};

type UseDeletePackageOptions = {
  mutationConfig?: UseMutationOptions<void, Error, { id: number }>;
};

export const useDeletePackage = ({ mutationConfig }: UseDeletePackageOptions = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...mutationConfig,
    mutationFn: deletePackage,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      mutationConfig?.onSuccess?.(...args);
    },
  });
};
