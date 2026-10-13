import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import {
  type FrameResponse,
  type BackendResponse,
  type FrameStatus,
  type FrameCategory,
  normalizeFrame,
} from './types';

export type GetFramesInput = {
  page?: number;
  limit?: number;
  search?: string;
  status?: FrameStatus | 'all';
  category?: FrameCategory | 'all';
  sortBy?: 'name' | 'category' | 'usedCount' | 'lastUsed';
  sortOrder?: 'asc' | 'desc';
};

export const getFrames = async (
  input?: GetFramesInput,
): Promise<FrameResponse> => {
  const response = await axiosInstance.get('/api/admin/frames', {
    params: input,
  });
  const payload = response.data as unknown as {
    data: BackendResponse[];
    meta: FrameResponse['meta'];
  };

  return {
    data: (payload.data ?? []).map(normalizeFrame),
    meta: payload.meta ?? { total: 0, page: 1, lastPage: 1 },
  };
};

export const getFramesQueryKey = (input?: GetFramesInput) => {
  if (!input) return ['frames'] as const;
  return ['frames', input] as const;
};

export const getFramesQueryOptions = (input?: GetFramesInput) => {
  return queryOptions({
    queryKey: getFramesQueryKey(input),
    queryFn: () => getFrames(input),
  });
};

type UseGetFramesParams = {
  queryConfig?: QueryConfig<typeof getFramesQueryOptions>;
  input?: GetFramesInput;
};

export const useGetFrames = ({
  queryConfig,
  input,
}: UseGetFramesParams = {}) => {
  return useQuery({
    ...getFramesQueryOptions(input),
    ...queryConfig,
  });
};
