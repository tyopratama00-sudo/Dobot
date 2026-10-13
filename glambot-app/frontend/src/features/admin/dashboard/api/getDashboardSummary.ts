import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import {
  type DashboardSummary,
  type BackendResponse,
  normalizeDashboardSummary,
} from './types';

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const response = await axiosInstance.get('/api/admin/dashboard/summary');
  return normalizeDashboardSummary(response.data as unknown as BackendResponse);
};

export const getDashboardSummaryQueryKey = () => {
  return ['dashboard', 'summary'] as const;
};

export const getDashboardSummaryQueryOptions = () => {
  return queryOptions({
    queryKey: getDashboardSummaryQueryKey(),
    queryFn: getDashboardSummary,
  });
};

type UseGetDashboardSummaryParams = {
  queryConfig?: QueryConfig<typeof getDashboardSummaryQueryOptions>;
};

export const useGetDashboardSummary = ({
  queryConfig,
}: UseGetDashboardSummaryParams = {}) => {
  return useQuery({
    ...getDashboardSummaryQueryOptions(),
    ...queryConfig,
  });
};
