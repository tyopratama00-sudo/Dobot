import { toStorageUrl } from '@/lib/storage-url';

export type PackageCode = 'vip' | 'regular';
export type PackageStatus = 'active' | 'inactive' | 'draft';
export type PackageType = 'digital' | 'print';

export interface Package {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  durationSecs: number;
  durationMins: number;
  type: PackageType;
  imageSrc: string;
  isPopular: boolean;
  printCount: number;
  printUnitPrice: number;
  status: PackageStatus;
}

export interface PackageStats {
  active: number;
  inactive: number;
  soldToday: number;
  revenueToday: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface PackageResponse {
  data: Package[];
  meta: PaginationMeta;
}

export type BackendResponse = {
  id: number;
  code: string;
  name: string;
  price: number;
  duration_secs: number;
  duration_mins: number;
  description: string;
  image_src: string;
  is_popular: boolean;
  print_count: number;
  print_unit_price?: number;
  status?: PackageStatus;
};

export const normalizePackage = (data: BackendResponse): Package => ({
  id: data.id,
  code: data.code,
  name: data.name,
  description: data.description || '',
  price: data.price,
  durationSecs: data.duration_secs,
  durationMins: data.duration_mins,
  type: data.code === 'vip' ? 'print' : 'digital',
  imageSrc: toStorageUrl(data.image_src),
  isPopular: data.is_popular,
  printCount: data.print_count,
  printUnitPrice: data.print_unit_price ?? 0,
  status: data.status || 'draft',
});
