import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient, toAbsoluteUrl } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

// Photo model (frontend shape)
export interface Photo {
  id: string;
  url: string;
  sessionId: string;
  thumbnailUrl?: string;
  type?: 'raw' | 'framed';
}

interface BackendPhoto {
  id: string;
  session_id: string;
  file_path: string;
  file_name: string;
  url: string;
  download_url?: string;
  type: string;
  selected: boolean;
}

const normalizePhoto = (p: BackendPhoto): Photo => ({
  id: p.id,
  sessionId: p.session_id,
  url: toAbsoluteUrl(p.url),
  type: p.type === 'framed' ? 'framed' : 'raw',
});

export const getPhotos = async (sessionId: string): Promise<Photo[]> => {
  const response = await apiClient.get<BackendPhoto[]>(
    `/api/photo/session/${sessionId}`,
  );
  return (response.data ?? []).map(normalizePhoto);
};

export const getFramedPhotos = async (sessionId: string): Promise<Photo[]> => {
  const response = await apiClient.get<BackendPhoto[]>(
    `/api/photo/session/${sessionId}/framed`,
  );
  return (response.data ?? []).map(normalizePhoto);
};

export const getPhotosQueryOptions = (sessionId: string) => {
  return queryOptions({
    queryKey: ['photos', sessionId],
    queryFn: () => getPhotos(sessionId),
  });
};

export const getFramedPhotosQueryOptions = (sessionId: string) => {
  return queryOptions({
    queryKey: ['photos-framed', sessionId],
    queryFn: () => getFramedPhotos(sessionId),
  });
};

type UsePhotosOptions = {
  sessionId: string;
  queryConfig?: QueryConfig<typeof getPhotosQueryOptions>;
};

export const usePhotos = ({ sessionId, queryConfig }: UsePhotosOptions) => {
  return useQuery({
    ...getPhotosQueryOptions(sessionId),
    ...queryConfig,
  });
};

type UseFramedPhotosOptions = {
  sessionId: string;
  queryConfig?: QueryConfig<typeof getFramedPhotosQueryOptions>;
};

export const useFramedPhotos = ({
  sessionId,
  queryConfig,
}: UseFramedPhotosOptions) => {
  return useQuery({
    ...getFramedPhotosQueryOptions(sessionId),
    ...queryConfig,
  });
};
