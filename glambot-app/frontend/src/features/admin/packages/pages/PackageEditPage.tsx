'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { NotFoundState } from '@/components/admin/shared/NotFoundState';
import { PackageForm } from '../components/PackageForm';
import { useGetPackageById } from '../api/getPackageById';
import {
  useUpdatePackage,
  type UpdatePackageInput,
} from '../api/updatePackage';

interface PackageEditPageProps {
  id: number;
}

export function PackageEditPage({ id }: PackageEditPageProps) {
  const router = useRouter();
  const { data: pkg, isLoading, isError } = useGetPackageById({ id });
  const updateMutation = useUpdatePackage();

  const handleSubmit = async (data: UpdatePackageInput & { image?: File }) => {
    try {
      await updateMutation.mutateAsync({ id, data });
      toast.success('Package updated successfully');
      router.push('/packages');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An error occurred while updating the package';
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !pkg) {
    return (
      <NotFoundState
        title="Package not found"
        backLabel="Back to Packages"
        onBack={() => router.push('/packages')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-regular text-xl leading-7">Edit Package</h1>
          <p className="text-muted-foreground mt-1 text-[14px] leading-5">
            Update package <br /> information
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/packages')}
          className="gap-2 rounded-[8px] text-[16px] leading-6"
        >
          <ChevronLeftIcon className="size-4" />
          Back to Packages
        </Button>
      </div>

      <div className="bg-card rounded-[8px] border p-6 shadow-sm">
        <PackageForm
          defaultValues={pkg}
          onSubmit={handleSubmit}
          isSubmitting={updateMutation.isPending}
          mode="edit"
        />
      </div>
    </div>
  );
}
