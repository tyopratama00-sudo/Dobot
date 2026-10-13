import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type Package, type BackendResponse, normalizePackage, type PackageCode, type PackageStatus } from './types';

export type CreatePackageInput = {
  name: string;
  description?: string;
  price: number;
  duration: number; // in minutes (UI)
  code: PackageCode;
  status: PackageStatus;
  isPopular?: boolean;
  printCount?: number;
  printUnitPrice?: number;
  image?: File;
};

export const createPackage = async (
  input: CreatePackageInput,
): Promise<Package> => {
  const formData = new FormData();
  formData.append('name', input.name);
  if (input.description) formData.append('description', input.description);
  formData.append('price', input.price.toString());
  formData.append('duration_secs', (input.duration * 60).toString());
  formData.append('duration_mins', input.duration.toString());
  formData.append('code', input.code);
  formData.append('status', input.status);
  if (input.isPopular !== undefined)
    formData.append('is_popular', input.isPopular.toString());
  if (input.printCount !== undefined)
    formData.append('print_count', input.printCount.toString());
  if (input.printUnitPrice !== undefined)
    formData.append('print_unit_price', input.printUnitPrice.toString());
  if (input.image) formData.append('image', input.image);

  const response = await axiosInstance.post('/api/admin/packages', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return normalizePackage(response.data as unknown as BackendResponse);
};

export const useCreatePackage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPackage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });
};
