'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { VoucherForm } from '../components/VoucherForm';
import { VoucherFormData } from '../forms/voucher';
import { useCreateVoucher } from '../api/createVoucher';
import { Button } from '@/components/admin/ui/button';
import { ChevronLeftIcon } from 'lucide-react';

export function VoucherCreatePage() {
  const router = useRouter();
  const createMutation = useCreateVoucher();

  const handleSubmit = async (data: VoucherFormData) => {
    try {
      await createMutation.mutateAsync(data);
      toast.success('Voucher created successfully');
      router.push('/voucher');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An error occurred while creating the voucher';
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-regular text-xl leading-7">
            Generate New Voucher
          </h1>
          <p className="text-muted-foreground mt-1 text-[14px] leading-5">
            Create new vouchers for promo <br /> and other needs
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
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
          mode="create"
        />
      </div>
    </div>
  );
}
