import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type VoucherStats } from './types';

export const getVoucherStats = async (): Promise<VoucherStats> => {
  const response = await axiosInstance.get('/api/admin/vouchers/stats');
  return response.data as unknown as VoucherStats;
};

export const getVoucherStatsQueryKey = () => {
  return ['vouchers', 'stats'] as const;
};

export const getVoucherStatsQueryOptions = () => {
  return queryOptions({
    queryKey: getVoucherStatsQueryKey(),
    queryFn: getVoucherStats,
  });
};

type UseGetVoucherStatsParams = {
  queryConfig?: QueryConfig<typeof getVoucherStatsQueryOptions>;
};

export const useGetVoucherStats = ({
  queryConfig,
}: UseGetVoucherStatsParams = {}) => {
  return useQuery({
    ...getVoucherStatsQueryOptions(),
    ...queryConfig,
  });
};
