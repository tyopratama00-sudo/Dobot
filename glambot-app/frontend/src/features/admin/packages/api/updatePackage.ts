import { useMutation, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import {
  type Package,
  type PackageResponse,
  type BackendResponse,
  normalizePackage,
} from './types';
import { type CreatePackageInput } from './createPackage';

export type UpdatePackageInput = Partial<CreatePackageInput>;

export const updatePackage = async ({
  id,
  data,
}: {
  id: number;
  data: UpdatePackageInput;
}): Promise<Package> => {
  const formData = new FormData();
  if (data.name !== undefined) formData.append('name', data.name);
  if (data.description !== undefined)
    formData.append('description', data.description);
  if (data.price !== undefined) formData.append('price', data.price.toString());
  if (data.duration !== undefined) {
    formData.append('duration_secs', (data.duration * 60).toString());
    formData.append('duration_mins', data.duration.toString());
  }
  if (data.code !== undefined) formData.append('code', data.code);
  if (data.status !== undefined) formData.append('status', data.status);
  if (data.isPopular !== undefined)
    formData.append('is_popular', data.isPopular.toString());
  if (data.printCount !== undefined)
    formData.append('print_count', data.printCount.toString());
  if (data.printUnitPrice !== undefined)
    formData.append('print_unit_price', data.printUnitPrice.toString());
  if (data.image) formData.append('image', data.image);

  const response = await axiosInstance.patch(
    `/api/admin/packages/${id}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  return normalizePackage(response.data as unknown as BackendResponse);
};

export const useUpdatePackage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePackage,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      queryClient.invalidateQueries({ queryKey: ['packages', variables.id] });
    },
  });
};

// Optimistic status update hook
export const useUpdatePackageStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      updatePackage({ id, data: { status: status as UpdatePackageInput['status'] } }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['packages'] });
      const previousData = queryClient.getQueryData(['packages', 'list']);
      queryClient.setQueriesData(
        { queryKey: ['packages', 'list'] },
        (old: PackageResponse | undefined) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((pkg: Package) =>
              pkg.id === id ? { ...pkg, status } : pkg,
            ),
          };
        },
      );
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['packages', 'list'], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
    },
  });
};
