import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type Package, type BackendResponse, normalizePackage } from './types';

export const getPackageById = async (id: number): Promise<Package> => {
  const response = await axiosInstance.get(`/api/admin/packages/${id}`);
  return normalizePackage(response.data as unknown as BackendResponse);
};

export const getPackageByIdQueryKey = (id: number) => {
  return ['packages', id] as const;
};

export const getPackageByIdQueryOptions = (id: number) => {
  return queryOptions({
    queryKey: getPackageByIdQueryKey(id),
    queryFn: () => getPackageById(id),
    enabled: !!id,
  });
};

type UseGetPackageByIdParams = {
  queryConfig?: QueryConfig<typeof getPackageByIdQueryOptions>;
  id: number;
};

export const useGetPackageById = ({ id, queryConfig }: UseGetPackageByIdParams) => {
  return useQuery({
    ...getPackageByIdQueryOptions(id),
    ...queryConfig,
  });
};
