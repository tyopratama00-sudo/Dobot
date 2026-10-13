import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient, toAbsoluteUrl } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

export type SlotShape = 'rect' | 'ellipse' | 'circle';

export interface FrameSlot {
  id: string;
  shape: SlotShape;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface Frame {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  slots: FrameSlot[];
}

interface BackendFrame {
  id: string;
  name: string;
  category?: string;
  file_path: string;
  thumb_url: string;
  photo_slots: number;
  canvas_width?: number;
  canvas_height?: number;
  slots?: FrameSlot[];
}

export const getFrames = async (): Promise<Frame[]> => {
  const response = await apiClient.get<BackendFrame[]>('/api/frames');
  const raw = response.data ?? [];
  return raw.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category?.trim() || 'Other',
    imageUrl: toAbsoluteUrl(f.thumb_url),
    canvasWidth: f.canvas_width ?? 464,
    canvasHeight: f.canvas_height ?? 696,
    slots: Array.isArray(f.slots) ? f.slots : [],
  }));
};

export const getFramesQueryOptions = () => {
  return queryOptions({
    queryKey: ['frames'],
    queryFn: getFrames,
  });
};

type UseFramesOptions = {
  queryConfig?: QueryConfig<typeof getFramesQueryOptions>;
};

export const useFrames = ({ queryConfig }: UseFramesOptions = {}) => {
  return useQuery({
    ...getFramesQueryOptions(),
    ...queryConfig,
  });
};
