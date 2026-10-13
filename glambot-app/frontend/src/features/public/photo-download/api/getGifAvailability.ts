import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

interface LiveGifAvailability {
  available: boolean;
}

export const getLiveGifAvailability = async (
  sessionId: string,
): Promise<LiveGifAvailability> => {
  const response = await apiClient.get<LiveGifAvailability>(
    `/api/photo/session/${sessionId}/gif-live/available`,
  );
  return response.data ?? { available: false };
};

export const getLiveGifAvailabilityQueryOptions = (sessionId: string) => {
  return queryOptions({
    queryKey: ['gif-live-availability', sessionId],
    queryFn: () => getLiveGifAvailability(sessionId),
    enabled: !!sessionId,
  });
};

type UseLiveGifAvailabilityOptions = {
  sessionId: string;
  queryConfig?: QueryConfig<typeof getLiveGifAvailabilityQueryOptions>;
};

export const useLiveGifAvailability = ({
  sessionId,
  queryConfig,
}: UseLiveGifAvailabilityOptions) => {
  return useQuery({
    ...getLiveGifAvailabilityQueryOptions(sessionId),
    ...queryConfig,
  });
};
