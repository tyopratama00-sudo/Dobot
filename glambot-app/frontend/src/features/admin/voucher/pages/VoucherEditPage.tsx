'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ChevronLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { NotFoundState } from '@/components/admin/shared/NotFoundState';
import { VoucherForm } from '../components/VoucherForm';
import { VoucherFormData } from '../forms/voucher';
import { useGetVoucherById } from '../api/getVoucherById';
import { useUpdateVoucher } from '../api/updateVoucher';

export function VoucherEditPage() {
  const router = useRouter();
  const params = useParams();
  const voucherCode = params.id as string;

  const { data: voucher, isLoading, isError } = useGetVoucherById({
    id: voucherCode,
  });
  const updateMutation = useUpdateVoucher();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: VoucherFormData) => {
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({ id: voucherCode, data });
      toast.success('Voucher updated successfully');
      router.push('/voucher');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An error occurred while updating the voucher';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-125 w-full" />
      </div>
    );
  }

  if (isError || !voucher) {
    return (
      <NotFoundState
        title="Voucher not found"
        backLabel="Back to Vouchers"
        onBack={() => router.push('/voucher')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-regular text-xl leading-7">Edit Voucher</h1>
          <p className="text-muted-foreground mt-1 text-[14px] leading-5">
            Update voucher details
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/voucher')}
          className="gap-2 rounded-[8px] text-[16px] leading-6"
        >
          <ChevronLeftIcon className="size-4" />
          Back to Voucher
        </Button>
      </div>

      <div className="bg-card rounded-[8px] border p-6 shadow-sm">
        <VoucherForm
          defaultValues={voucher}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          mode="edit"
        />
      </div>
    </div>
  );
}
