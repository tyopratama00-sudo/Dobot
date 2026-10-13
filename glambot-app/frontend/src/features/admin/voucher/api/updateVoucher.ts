import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type Voucher, type BackendResponse, normalizeVoucher } from './types';
import { type CreateVoucherInput } from './createVoucher';

export type UpdateVoucherInput = Partial<CreateVoucherInput>;

export const updateVoucher = async (
  id: string,
  data: UpdateVoucherInput,
): Promise<Voucher> => {
  const response = await axiosInstance.patch(`/api/admin/vouchers/${id}`, data);
  return normalizeVoucher(response.data as unknown as BackendResponse);
};

export const useUpdateVoucher = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateVoucherInput }) =>
      updateVoucher(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
    },
  });
};
