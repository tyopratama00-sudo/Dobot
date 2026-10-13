import { ConfirmDeleteDialog } from '@/components/admin/shared/ConfirmDeleteDialog';

interface FrameDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameName: string;
  onConfirm: () => void;
  isPending: boolean;
}

export function FrameDeleteDialog({
  open,
  onOpenChange,
  frameName,
  onConfirm,
  isPending,
}: FrameDeleteDialogProps) {
  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Frame"
      description={
        <>
          Are you sure you want to delete{' '}
          <span className="text-foreground font-semibold">{frameName}</span>?
          This action cannot be undone.
        </>
      }
      onConfirm={onConfirm}
      isPending={isPending}
    />
  );
}
