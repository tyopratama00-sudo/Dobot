import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type PackageStats } from './types';

export const getPackageStats = async (): Promise<PackageStats> => {
  const response = await axiosInstance.get('/api/admin/packages/stats');
  return response.data as unknown as PackageStats;
};

export const getPackageStatsQueryKey = () => {
  return ['packages', 'stats'] as const;
};

export const getPackageStatsQueryOptions = () => {
  return queryOptions({
    queryKey: getPackageStatsQueryKey(),
    queryFn: getPackageStats,
  });
};

type UseGetPackageStatsParams = {
  queryConfig?: QueryConfig<typeof getPackageStatsQueryOptions>;
};

export const useGetPackageStats = ({
  queryConfig,
}: UseGetPackageStatsParams = {}) => {
  return useQuery({
    ...getPackageStatsQueryOptions(),
    ...queryConfig,
  });
};
