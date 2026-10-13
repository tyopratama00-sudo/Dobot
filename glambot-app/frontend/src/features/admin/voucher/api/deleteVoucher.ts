import { axiosInstance } from '@/lib/api-admin';
import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';

export const deleteVoucher = async ({ id }: { id: string }): Promise<void> => {
  await axiosInstance.delete(`/api/admin/vouchers/${id}`);
};

type UseDeleteVoucherOptions = {
  mutationConfig?: UseMutationOptions<void, Error, { id: string }>;
};

export const useDeleteVoucher = ({ mutationConfig }: UseDeleteVoucherOptions = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...mutationConfig,
    mutationFn: deleteVoucher,
    onSuccess: (...args) => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
      mutationConfig?.onSuccess?.(...args);
    },
  });
};
