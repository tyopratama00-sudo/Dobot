import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import type { AppConfig } from '@/shared/api/config';

// Endpoint admin mengembalikan struct yang sama dengan /api/config, jadi
// bentuknya ikut AppConfig (satu deklarasi) — nama TimerSettings dipertahankan
// karena itu istilah yang dipakai di halaman Settings.
export type TimerSettings = AppConfig;

export const TIMER_SETTINGS_KEY = ['admin', 'settings'] as const;

const getTimerSettings = async (): Promise<TimerSettings> => {
  const res = await axiosInstance.get('/api/admin/settings');
  return res.data as unknown as TimerSettings;
};

export const useTimerSettings = () =>
  useQuery({
    queryKey: TIMER_SETTINGS_KEY,
    queryFn: getTimerSettings,
    staleTime: 0,
  });

const updateTimerSettings = async (
  data: Partial<TimerSettings>,
): Promise<TimerSettings> => {
  const res = await axiosInstance.patch('/api/admin/settings', data);
  return res.data as unknown as TimerSettings;
};

export const useUpdateTimerSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateTimerSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(TIMER_SETTINGS_KEY, data);
      // Segarkan cache config publik (kalau ada tab kiosk di proses yang sama).
      queryClient.invalidateQueries({ queryKey: ['app-config'] });
    },
  });
};
