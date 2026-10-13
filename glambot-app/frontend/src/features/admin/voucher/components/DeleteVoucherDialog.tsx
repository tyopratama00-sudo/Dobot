'use client';

import { AlertCircle } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/admin/shared/ConfirmDeleteDialog';

interface DeleteVoucherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherCode: string;
  usedCount?: number;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteVoucherDialog({
  open,
  onOpenChange,
  voucherCode,
  usedCount = 0,
  onConfirm,
  isPending,
}: DeleteVoucherDialogProps) {
  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Voucher"
      description={
        <>
          Are you sure you want to delete voucher{' '}
          <span className="text-foreground font-semibold font-mono">{voucherCode}</span>?
          This action cannot be undone.
        </>
      }
      onConfirm={onConfirm}
      isPending={isPending}
    >
      {usedCount > 0 && (
        <div className="flex gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-yellow-600" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">Warning</p>
            <p>This voucher has been used {usedCount} times.</p>
          </div>
        </div>
      )}
    </ConfirmDeleteDialog>
  );
}
