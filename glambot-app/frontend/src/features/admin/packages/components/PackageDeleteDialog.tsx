import { ConfirmDeleteDialog } from '@/components/admin/shared/ConfirmDeleteDialog';

interface PackageDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageName: string;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function PackageDeleteDialog({
  open,
  onOpenChange,
  packageName,
  onConfirm,
  isDeleting,
}: PackageDeleteDialogProps) {
  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Package"
      description={
        <>
          Are you sure you want to delete{' '}
          <span className="text-foreground font-semibold">{packageName}</span>?
          This action cannot be undone.
        </>
      }
      onConfirm={onConfirm}
      isPending={isDeleting}
    />
  );
}
