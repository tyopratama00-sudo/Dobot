import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Timer halaman user yang diatur admin. Bentuk ini dipakai DUA endpoint yang
// mengembalikan struct backend yang sama (`timerConfig` di handlers/config.go):
// GET /api/config (publik, di sini) dan GET/PATCH /api/admin/settings (admin,
// lihat TimerSettings di features/admin/settings). Deklarasikan di satu tempat
// saja supaya tidak ada yang ketinggalan saat field bertambah.
export interface AppConfig {
  packageTimeoutSecs: number;
  summaryTimeoutSecs: number;
  instructionTimeoutSecs: number;
  photoEditorTimeoutSecs: number;
  getPhotosTimeoutSecs: number;
  doneScreenTimeoutSecs: number;
}

const getAppConfig = async (): Promise<AppConfig> => {
  const res = await apiClient.get<AppConfig>('/api/config');
  return res.data as unknown as AppConfig;
};

/**
 * Timer config dari backend. JANGAN render <Timer> sebelum `data` ada —
 * durasi yang berubah me-reset usePersistedCountdown. Gate pemanggilnya:
 * `{config && <Timer duration={config.x} />}`.
 */
export const useAppConfig = () =>
  useQuery({
    queryKey: ['app-config'],
    queryFn: getAppConfig,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
