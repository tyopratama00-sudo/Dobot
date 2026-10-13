import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import {
  type VoucherResponse,
  type BackendResponse,
  type DiscountType,
  type VoucherStatusFilter,
  normalizeVoucher,
} from './types';

export type GetVouchersInput = {
  page?: number;
  limit?: number;
  search?: string;
  status?: VoucherStatusFilter;
  discountType?: DiscountType | 'all';
  /** 1-12, filter berdasarkan bulan `expires_at`. */
  month?: number | 'all';
  sortBy?: 'code' | 'createdAt' | 'discountValue' | 'usedCount';
  sortOrder?: 'asc' | 'desc';
};

export const getVouchers = async (
  input?: GetVouchersInput,
): Promise<VoucherResponse> => {
  const response = await axiosInstance.get('/api/admin/vouchers', {
    params: input,
  });
  const payload = response.data as unknown as {
    data: BackendResponse[];
    meta: VoucherResponse['meta'];
  };

  return {
    data: (payload.data ?? []).map(normalizeVoucher),
    meta: payload.meta ?? { total: 0, page: 1, lastPage: 1 },
  };
};

export const getVouchersQueryKey = (input?: GetVouchersInput) => {
  if (!input) return ['vouchers'] as const;
  return ['vouchers', input] as const;
};

export const getVouchersQueryOptions = (input?: GetVouchersInput) => {
  return queryOptions({
    queryKey: getVouchersQueryKey(input),
    queryFn: () => getVouchers(input),
  });
};

type UseGetVouchersParams = {
  queryConfig?: QueryConfig<typeof getVouchersQueryOptions>;
  input?: GetVouchersInput;
};

export const useGetVouchers = ({
  queryConfig,
  input,
}: UseGetVouchersParams = {}) => {
  return useQuery({
    ...getVouchersQueryOptions(input),
    ...queryConfig,
  });
};
