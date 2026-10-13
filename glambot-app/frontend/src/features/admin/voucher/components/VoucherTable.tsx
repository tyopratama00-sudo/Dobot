'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpDown, CircleEllipsis, PencilIcon, Trash2Icon } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Checkbox } from '@/components/admin/ui/checkbox';
import { Progress } from '@/components/admin/ui/progress';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { formatDateShort } from '@/lib/formats';
import { useSortedRows } from '@/lib/useTableRows';
import { type Voucher } from '../api/types';
import { DeleteVoucherDialog } from './DeleteVoucherDialog';
import { useDeleteVoucher } from '../api/deleteVoucher';
import { formatDiscount } from '../utils/formatDiscount';
import { getDerivedStatus, type DerivedVoucherStatus } from '../utils/voucherStatus';
import { useClientNow } from '../utils/useClientNow';
import { toast } from 'sonner';

type SortKey = 'code' | 'discountValue' | 'usedCount' | 'expiresAt';
type SortDir = 'asc' | 'desc';

type VoucherTableProps = {
  data: Voucher[];
  isLoading?: boolean;
};

const COLUMNS = ['', 'Code', 'Type', 'Benefit', 'Used', 'Expired', 'Status', ''];

const STATUS_COLOR: Record<DerivedVoucherStatus, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-yellow-100 text-yellow-800',
  expired: 'bg-red-100 text-red-800',
};

const SortBtn = ({
  col,
  onClick,
}: {
  col: SortKey;
  onClick: (col: SortKey) => void;
}) => (
  <Button
    variant="ghost"
    size="icon"
    className="ml-1 size-6"
    onClick={() => onClick(col)}
  >
    <ArrowUpDown className="size-3" />
  </Button>
);

export function VoucherTable({ data, isLoading }: VoucherTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>('code');
  const [sortDir, setSortDir] = React.useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = React.useState<Voucher | null>(null);
  const [selectedCodes, setSelectedCodes] = React.useState<Set<string>>(
    new Set(),
  );
  const now = useClientNow();

  const toggleRow = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const toggleAll = (codes: string[], checked: boolean) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (checked) {
        codes.forEach((c) => next.add(c));
      } else {
        codes.forEach((c) => next.delete(c));
      }
      return next;
    });
  };

  const { mutate: deleteVoucher, isPending: isDeleting } = useDeleteVoucher({
    mutationConfig: {
      onSuccess: () => {
        toast.success('Voucher deleted successfully');
        setDeleteTarget(null);
      },
      onError: (error: Error) => {
        toast.error(error.message || 'Failed to delete voucher');
      },
    },
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useSortedRows(data, sortKey, sortDir);

  if (isLoading) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((h, i) => (
                <TableHead key={`col-${i}`} className="text-sm font-semibold">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: COLUMNS.length }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((h, i) => (
                <TableHead key={`col-${i}`} className="text-sm font-semibold">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  No vouchers found. Generate your first voucher.
                </p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    sorted.length > 0 &&
                    sorted.every((v) => selectedCodes.has(v.code))
                      ? true
                      : sorted.some((v) => selectedCodes.has(v.code))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) =>
                    toggleAll(
                      sorted.map((v) => v.code),
                      checked === true,
                    )
                  }
                  aria-label="Select all vouchers"
                />
              </TableHead>
              <TableHead className="text-sm font-semibold">
                <div className="flex items-center">
                  Code <SortBtn col="code" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold sm:table-cell">Type</TableHead>
              <TableHead className="text-sm font-semibold">
                <div className="flex items-center">
                  Benefit <SortBtn col="discountValue" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold md:table-cell">
                <div className="flex items-center">
                  Used <SortBtn col="usedCount" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold lg:table-cell">
                <div className="flex items-center">
                  Expired <SortBtn col="expiresAt" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="text-sm font-semibold">Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((voucher) => {
              const status = getDerivedStatus(voucher, now);
              return (
                <TableRow
                  key={voucher.code}
                  className="hover:bg-muted/50"
                  data-state={
                    selectedCodes.has(voucher.code) ? 'selected' : undefined
                  }
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedCodes.has(voucher.code)}
                      onCheckedChange={() => toggleRow(voucher.code)}
                      aria-label={`Select voucher ${voucher.code}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-sm font-semibold text-blue-600">
                      {voucher.code}
                    </div>
                    <div className="text-muted-foreground text-xs">{voucher.description}</div>
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {voucher.discountType === 'percentage' ? 'Percentage' : 'Fixed Amount'}
                  </TableCell>
                  <TableCell className="font-semibold text-sm">
                    {formatDiscount(voucher.discountValue, voucher.discountType)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="min-w-32">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold text-blue-600">
                          {voucher.usedCount}/{voucher.maxUses}
                        </span>
                        <span className="text-muted-foreground">
                          {voucher.maxUses > 0
                            ? ((voucher.usedCount / voucher.maxUses) * 100).toFixed(0)
                            : 0}%
                        </span>
                      </div>
                      <Progress
                        value={voucher.maxUses > 0 ? (voucher.usedCount / voucher.maxUses) * 100 : 0}
                        className="h-1.5"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {voucher.expiresAt
                      ? formatDateShort(voucher.expiresAt)
                      : 'No expiry'}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLOR[status]}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <CircleEllipsis className="size-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => router.push(`/voucher/${voucher.code}/edit`)}
                          >
                            <PencilIcon className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(voucher)}
                          >
                            <Trash2Icon className="mr-2 size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <DeleteVoucherDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        voucherCode={deleteTarget?.code ?? ''}
        usedCount={deleteTarget?.usedCount}
        onConfirm={() => deleteTarget && deleteVoucher({ id: deleteTarget.code })}
        isPending={isDeleting}
      />
    </>
  );
}
