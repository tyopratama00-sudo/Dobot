import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface RobotConfig {
  current_preset: number;
  auto_capture_active: boolean;
  auto_capture_remaining_ms: number;
}

const getRobotConfig = async (): Promise<RobotConfig> => {
  const res = await apiClient.get<RobotConfig>('/api/robot/config');
  return {
    current_preset: res.data?.current_preset ?? 0,
    auto_capture_active: res.data?.auto_capture_active === true,
    auto_capture_remaining_ms: res.data?.auto_capture_remaining_ms ?? 0,
  };
};

// useRobotConfig — polling 250ms. React Query auto-dedupes: kalau multiple
// component pakai hook ini, hanya ada SATU request setiap interval (bukan
// satu per consumer). Sumber tunggal untuk countdown overlay (CameraPreview)
// dan grace-period safeguard (PhotoSessionPage).
export function useRobotConfig() {
  return useQuery({
    queryKey: ['robot-config'],
    queryFn: getRobotConfig,
    refetchInterval: 250,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}
