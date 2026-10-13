import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type TransactionStats } from './types';

export const getTransactionStats = async (): Promise<TransactionStats> => {
  const response = await axiosInstance.get('/api/admin/transactions/stats');
  return response.data as unknown as TransactionStats;
};

export const getTransactionStatsQueryKey = () => {
  return ['transactions', 'stats'] as const;
};

export const getTransactionStatsQueryOptions = () => {
  return queryOptions({
    queryKey: getTransactionStatsQueryKey(),
    queryFn: getTransactionStats,
    // Auto-refresh: statistik ikut ter-update tiap 15s + saat tab kembali fokus.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
};

type UseGetTransactionStatsParams = {
  queryConfig?: QueryConfig<typeof getTransactionStatsQueryOptions>;
};

export const useGetTransactionStats = ({
  queryConfig,
}: UseGetTransactionStatsParams = {}) => {
  return useQuery({
    ...getTransactionStatsQueryOptions(),
    ...queryConfig,
  });
};
