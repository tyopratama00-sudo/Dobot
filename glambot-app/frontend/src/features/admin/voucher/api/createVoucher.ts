import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import {
  type Voucher,
  type BackendResponse,
  type DiscountType,
  normalizeVoucher,
} from './types';

export type CreateVoucherInput = {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  minPrice: number;
  maxUses: number;
  isActive: boolean;
  expiresAt?: string;
};

export const createVoucher = async (
  data: CreateVoucherInput,
): Promise<Voucher> => {
  const response = await axiosInstance.post('/api/admin/vouchers', data);
  return normalizeVoucher(response.data as unknown as BackendResponse);
};

export const useCreateVoucher = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createVoucher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vouchers'] });
    },
  });
};
