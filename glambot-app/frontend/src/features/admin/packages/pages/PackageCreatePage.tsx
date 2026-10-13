'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import { PackageForm } from '../components/PackageForm';
import { useCreatePackage } from '../api/createPackage';
import { type CreatePackageInput } from '../api/createPackage';

export function PackageCreatePage() {
  const router = useRouter();
  const createMutation = useCreatePackage();

  const handleSubmit = async (data: CreatePackageInput & { image?: File }) => {
    try {
      await createMutation.mutateAsync(data);
      toast.success('Package created successfully');
      router.push('/packages');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An error occurred while creating the package';
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-regular text-xl leading-7">Create Package</h1>
          <p className="text-muted-foreground mt-1 text-[14px] leading-5">
            Manage photo packages, prices, and <br /> package content details
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
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
          mode="create"
        />
      </div>
    </div>
  );
}
