import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

export interface DriveLink {
  // enabled: backend punya kredensial Google Drive (fitur aktif).
  enabled: boolean;
  // ready: folder sudah selesai diunggah & url siap dipakai.
  ready: boolean;
  // url: link folder Drive publik (kosong sampai ready).
  url: string;
}

export const getDriveLink = async (sessionId: string): Promise<DriveLink> => {
  const response = await apiClient.get<DriveLink>(
    `/api/photo/session/${sessionId}/drive`,
  );
  return response.data ?? { enabled: false, ready: false, url: '' };
};

export const getDriveLinkQueryOptions = (sessionId: string) => {
  return queryOptions({
    queryKey: ['drive-link', sessionId],
    queryFn: () => getDriveLink(sessionId),
    enabled: !!sessionId,
    // Upload jalan async di backend setelah compose. Poll tiap 2 detik sampai
    // url siap, lalu berhenti (juga berhenti kalau fitur tidak aktif).
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (!data.enabled) return false;
      return data.ready ? false : 2000;
    },
  });
};

type UseDriveLinkOptions = {
  sessionId: string;
  queryConfig?: QueryConfig<typeof getDriveLinkQueryOptions>;
};

export const useDriveLink = ({
  sessionId,
  queryConfig,
}: UseDriveLinkOptions) => {
  return useQuery({
    ...getDriveLinkQueryOptions(sessionId),
    ...queryConfig,
  });
};
