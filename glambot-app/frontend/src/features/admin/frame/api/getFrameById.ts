import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type Frame, type BackendResponse, normalizeFrame } from './types';

export const getFrameById = async (id: string): Promise<Frame> => {
  const response = await axiosInstance.get(`/api/admin/frames/${id}`);
  return normalizeFrame(response.data as unknown as BackendResponse);
};

export const getFrameByIdQueryKey = (id: string) => {
  return ['frames', id] as const;
};

export const getFrameByIdQueryOptions = (id: string) => {
  return queryOptions({
    queryKey: getFrameByIdQueryKey(id),
    queryFn: () => getFrameById(id),
    enabled: !!id,
  });
};

type UseGetFrameByIdParams = {
  queryConfig?: QueryConfig<typeof getFrameByIdQueryOptions>;
  id: string;
};

export const useGetFrameById = ({ id, queryConfig }: UseGetFrameByIdParams) => {
  return useQuery({
    ...getFrameByIdQueryOptions(id),
    ...queryConfig,
  });
};
