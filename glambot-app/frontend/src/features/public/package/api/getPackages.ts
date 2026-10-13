import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient, resolveBaseUrl } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

// Note: getPackages uses a custom abs-URL helper (different rule for /storage/
// vs frontend public assets), so we keep it local instead of using the shared
// `toAbsoluteUrl` from api-client.

export interface Package {
  id: number;
  type: 'digital' | 'print';
  title: string;
  description: string;
  price: number;
  pricePerPrint?: number;
  imageSrc: string;
  isPopular?: boolean;
  durationSecs: number;
  durationMins: number;
}

type BackendPackage = {
  id?: number;
  code?: string;
  name?: string;
  title?: string;
  base_price?: number;
  price?: number;
  duration_secs?: number;
  durationSecs?: number;
  description?: string;
  type?: Package['type'];
  image_src?: string;
  imageSrc?: string;
  is_popular?: boolean;
  isPopular?: boolean;
  print_count?: number;
  print_unit_price?: number;
  pricePerPrint?: number;
};

const packageAssets: Record<
  string,
  { type: Package['type']; imageSrc: string; isPopular: boolean }
> = {
  regular: {
    type: 'digital',
    imageSrc: '/Container.svg',
    isPopular: false,
  },
  vip: {
    type: 'print',
    imageSrc: '/Container (1).svg',
    isPopular: true,
  },
};

const toAbsoluteUrl = (path: string | undefined): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/storage/')) return `${resolveBaseUrl()}${path}`;
  // Frontend public-folder assets (e.g. /Container.svg) — leave relative
  return path;
};

const normalizePackage = (pkg: BackendPackage): Package => {
  const code = pkg.code ?? (pkg.type === 'print' ? 'vip' : 'regular');
  const asset = packageAssets[code] ?? packageAssets.regular;
  const durationSecs = pkg.duration_secs ?? pkg.durationSecs ?? 0;
  const title = pkg.name ?? pkg.title ?? code;
  const pricePerPrint =
    pkg.print_unit_price ??
    pkg.pricePerPrint ??
    (code === 'vip' ? 15000 : 0);
  const backendImg = toAbsoluteUrl(pkg.image_src ?? pkg.imageSrc);
  const popular = pkg.is_popular ?? pkg.isPopular;

  return {
    id: pkg.id ?? 0,
    type: pkg.type ?? asset.type,
    title,
    description: pkg.description ?? '',
    price: pkg.base_price ?? pkg.price ?? 0,
    pricePerPrint,
    imageSrc: backendImg ?? asset.imageSrc,
    isPopular: popular ?? asset.isPopular,
    durationSecs,
    durationMins: Math.floor(durationSecs / 60),
  };
};

export const getPackages = async (): Promise<Package[]> => {
  const response = await apiClient.get<Package[]>('/api/package');
  return (response.data as unknown as BackendPackage[]).map(normalizePackage);
};

export const getPackagesQueryOptions = () => {
  return queryOptions({ queryKey: ['packages'], queryFn: getPackages });
};

type UsePackagesOptions = {
  queryConfig?: QueryConfig<typeof getPackagesQueryOptions>;
};

export const usePackages = ({ queryConfig }: UsePackagesOptions = {}) => {
  return useQuery({ ...getPackagesQueryOptions(), ...queryConfig });
};
