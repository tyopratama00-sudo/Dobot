import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type PackageResponse, type BackendResponse, normalizePackage } from './types';

export type GetPackagesInput = {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'inactive' | 'draft' | 'all';
  code?: 'vip' | 'regular' | 'all';
  sortBy?: 'name' | 'price' | 'duration';
  sortOrder?: 'asc' | 'desc';
};

export const getPackages = async (
  input?: GetPackagesInput,
): Promise<PackageResponse> => {
  const response = await axiosInstance.get('/api/admin/packages', {
    params: input,
  });
  const payload = response.data as unknown as {
    data: BackendResponse[];
    meta: PackageResponse['meta'];
  };

  return {
    data: (payload.data ?? []).map(normalizePackage),
    meta: payload.meta ?? { total: 0, page: 1, lastPage: 1 },
  };
};

export const getPackagesQueryKey = (input?: GetPackagesInput) => {
  if (!input) return ['packages'] as const;
  return ['packages', input] as const;
};

export const getPackagesQueryOptions = (input?: GetPackagesInput) => {
  return queryOptions({
    queryKey: getPackagesQueryKey(input),
    queryFn: () => getPackages(input),
  });
};

type UseGetPackagesParams = {
  queryConfig?: QueryConfig<typeof getPackagesQueryOptions>;
  input?: GetPackagesInput;
};

export const useGetPackages = ({
  queryConfig,
  input,
}: UseGetPackagesParams = {}) => {
  return useQuery({
    ...getPackagesQueryOptions(input),
    ...queryConfig,
  });
};
