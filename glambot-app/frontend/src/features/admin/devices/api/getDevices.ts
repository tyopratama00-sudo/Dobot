import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import { type CameraInfo } from '../components/CameraCard';
import { type PrinterInfo } from '../components/PrinterCard';
import { type RobotInfo } from '../components/RobotCard';

export interface DevicesStatus {
  camera: CameraInfo;
  printer: PrinterInfo;
  robot: RobotInfo;
}

export const getDevices = async (): Promise<DevicesStatus> => {
  const response = await axiosInstance.get('/api/admin/devices');
  return response.data as unknown as DevicesStatus;
};

export const getDevicesQueryKey = () => ['devices', 'status'] as const;

export const getDevicesQueryOptions = () =>
  queryOptions({
    queryKey: getDevicesQueryKey(),
    queryFn: getDevices,
    // Auto-refresh: poll device status every 10s + refetch saat tab kembali fokus,
    // jadi perubahan status (camera/printer/robot online-offline) tampil otomatis.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

type UseGetDevicesParams = {
  queryConfig?: QueryConfig<typeof getDevicesQueryOptions>;
};

export const useGetDevices = ({ queryConfig }: UseGetDevicesParams = {}) =>
  useQuery({
    ...getDevicesQueryOptions(),
    ...queryConfig,
  });
