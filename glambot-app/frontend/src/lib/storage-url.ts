const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Jadikan path aset storage absolut. Backend mengembalikan bentuk campur
 * (absolut, "/storage/...", "storage/...", atau relatif "frames/x.svg").
 */
export const toStorageUrl = (path: string | undefined | null): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/storage/')) return `${API_URL}${path}`;
  if (path.startsWith('storage/')) return `${API_URL}/${path}`;
  if (path.startsWith('/')) return `${API_URL}${path}`;
  return `${API_URL}/storage/${path}`;
};
