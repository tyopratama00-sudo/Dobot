import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type FrameStats } from './types';

export const getFrameStats = async (): Promise<FrameStats> => {
  const response = await axiosInstance.get('/api/admin/frames/stats');
  return response.data as unknown as FrameStats;
};

export const getFrameStatsQueryKey = () => {
  return ['frames', 'stats'] as const;
};

export const getFrameStatsQueryOptions = () => {
  return queryOptions({
    queryKey: getFrameStatsQueryKey(),
    queryFn: getFrameStats,
  });
};

type UseGetFrameStatsParams = {
  queryConfig?: QueryConfig<typeof getFrameStatsQueryOptions>;
};

export const useGetFrameStats = ({ queryConfig }: UseGetFrameStatsParams = {}) => {
  return useQuery({
    ...getFrameStatsQueryOptions(),
    ...queryConfig,
  });
};
