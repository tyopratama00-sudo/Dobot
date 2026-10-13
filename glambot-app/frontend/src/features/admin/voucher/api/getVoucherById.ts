import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type Voucher, type BackendResponse, normalizeVoucher } from './types';

export const getVoucherById = async (id: string): Promise<Voucher> => {
  const response = await axiosInstance.get(`/api/admin/vouchers/${id}`);
  return normalizeVoucher(response.data as unknown as BackendResponse);
};

export const getVoucherByIdQueryKey = (id: string) => {
  return ['vouchers', 'detail', id] as const;
};

export const getVoucherByIdQueryOptions = (id: string) => {
  return queryOptions({
    queryKey: getVoucherByIdQueryKey(id),
    queryFn: () => getVoucherById(id),
    enabled: !!id,
  });
};

type UseGetVoucherByIdParams = {
  queryConfig?: QueryConfig<typeof getVoucherByIdQueryOptions>;
  id: string;
};

export const useGetVoucherById = ({
  id,
  queryConfig,
}: UseGetVoucherByIdParams) => {
  return useQuery({
    ...getVoucherByIdQueryOptions(id),
    ...queryConfig,
  });
};
