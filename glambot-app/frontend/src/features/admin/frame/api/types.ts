import { toStorageUrl } from '@/lib/storage-url';

export type FrameStatus = 'active' | 'inactive';
export type SlotShape = 'rect' | 'circle' | 'ellipse';
// Kategori frame berbasis kapasitas orang: 'Personal' (1-4 orang) & 'Group'
// (banyak orang). Filter admin/publik tetap data-driven, jadi tipe ini hanya
// memandu opsi form & nilai default.
export type FrameCategory = 'Personal' | 'Group';

export interface FrameSlot {
  id: string;
  shape: SlotShape;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface Frame {
  id: string;
  frameCode: string;
  name: string;
  category: string;
  description: string;
  filePath: string;
  thumbUrl: string;
  photoSlots: number;
  canvasWidth: number;
  canvasHeight: number;
  slots: FrameSlot[];
  status: FrameStatus;
  usedCount: number;
  usedToday: number;
  fileSize: string;
  dateCreated: string;
  lastModified: string;
  lastUsed: string;
}

export interface FrameStats {
  total: number;
  active: number;
  inactive: number;
  usedToday: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface FrameResponse {
  data: Frame[];
  meta: PaginationMeta;
}

export type BackendResponse = {
  id: string;
  frame_code: string;
  name: string;
  category: string;
  description: string;
  file_path: string;
  thumb_url: string;
  photo_slots: number;
  canvas_width: number;
  canvas_height: number;
  slots: FrameSlot[];
  status: FrameStatus;
  used_count: number;
  used_today: number;
  file_size: string;
  date_created: string;
  last_modified: string;
  last_used: string;
};

export const normalizeFrame = (data: BackendResponse): Frame => ({
  id: data.id,
  frameCode: data.frame_code ?? '',
  name: data.name,
  category: data.category,
  description: data.description ?? '',
  filePath: toStorageUrl(data.file_path),
  thumbUrl: toStorageUrl(data.thumb_url || data.file_path),
  photoSlots: data.photo_slots ?? (data.slots?.length ?? 0),
  canvasWidth: data.canvas_width ?? 0,
  canvasHeight: data.canvas_height ?? 0,
  slots: data.slots ?? [],
  status: data.status,
  usedCount: data.used_count ?? 0,
  usedToday: data.used_today ?? 0,
  fileSize: data.file_size ?? '0 MB',
  dateCreated: data.date_created ?? '',
  lastModified: data.last_modified ?? '',
  lastUsed: data.last_used ?? '',
});
