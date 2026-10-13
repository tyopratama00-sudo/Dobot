import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig } from '@/lib/react-query';

export interface ApplyVoucherResponse {
  valid: boolean;
  message: string;
  discountAmount: number;
  finalPrice: number;
  voucher: {
    code: string;
    description: string;
    discountType: string;
    discountValue: number;
  } | null;
}

type BackendVoucherResponse = {
  valid?: boolean;
  message?: string;
  discount_amount?: number;
  discountAmount?: number;
  final_price?: number;
  finalPrice?: number;
  voucher?: {
    code: string;
    description: string;
    discount_type?: string;
    discountType?: string;
    discount_value?: number;
    discountValue?: number;
  } | null;
};

const normalizeVoucherResponse = (
  response: BackendVoucherResponse,
): ApplyVoucherResponse => ({
  valid: response.valid ?? false,
  message: response.message ?? '',
  discountAmount: response.discount_amount ?? response.discountAmount ?? 0,
  finalPrice: response.final_price ?? response.finalPrice ?? 0,
  voucher: response.voucher
    ? {
        code: response.voucher.code,
        description: response.voucher.description,
        discountType:
          response.voucher.discount_type ?? response.voucher.discountType ?? '',
        discountValue:
          response.voucher.discount_value ?? response.voucher.discountValue ?? 0,
      }
    : null,
});

export const applyVoucher = async (data: {
  sessionId: string;
  voucherCode: string;
}): Promise<ApplyVoucherResponse> => {
  const response = await apiClient.post<BackendVoucherResponse>(
    '/api/voucher/apply',
    {
      session_id: data.sessionId,
      sessionId: data.sessionId,
      voucher_code: data.voucherCode,
      voucherCode: data.voucherCode,
    },
  );
  return normalizeVoucherResponse(response.data);
};

type UseApplyVoucherOptions = {
  mutationConfig?: MutationConfig<typeof applyVoucher>;
};

export const useApplyVoucher = ({
  mutationConfig,
}: UseApplyVoucherOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: applyVoucher,
  });
};
