'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowUpDown,
  CircleEllipsis,
  EyeIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';
import { Button } from '@/components/admin/ui/button';
import { Checkbox } from '@/components/admin/ui/checkbox';
import { Skeleton } from '@/components/admin/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { formatIDR } from '@/lib/formats';
import { type Package, type PackageStatus } from '../api/types';
import { Badge } from '@/components/admin/ui/badge';
import { PackageDeleteDialog } from './PackageDeleteDialog';
import { useDeletePackage } from '../api/deletePackage';
import { useUpdatePackageStatus } from '../api/updatePackage';
import { toast } from 'sonner';

type SortKey = 'name' | 'price' | 'status' | 'sold';
type SortDir = 'asc' | 'desc';

type PackageTableProps = {
  data: Package[];
  isLoading?: boolean;
  selectedId?: number | null;
  onSelect?: (pkg: Package) => void;
};

const STATUS_OPTIONS: PackageStatus[] = ['active', 'inactive', 'draft'];

const COLUMNS = ['', 'Package', 'Content', 'Price', 'Status', 'Sold', ''];

const STATUS_CONFIG: Record<
  PackageStatus,
  { label: string; className: string }
> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-100/80',
  },
  draft: {
    label: 'Draft',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
  },
};

// Hardcoded sold values per package id (will come from a different API later)
const getSoldCount = (id: number) => ((id * 37) % 250) + 12;

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

export function PackageTable({
  data,
  isLoading,
  selectedId,
  onSelect,
}: PackageTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [sortDir, setSortDir] = React.useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = React.useState<Package | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = (ids: number[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        ids.forEach((id) => next.add(id));
      } else {
        ids.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const { mutate: deletePackage, isPending: isDeleting } = useDeletePackage({
    mutationConfig: {
      onSuccess: () => {
        toast.success('Package deleted successfully');
        setDeleteTarget(null);
      },
      onError: (error: Error) => {
        toast.error(error.message || 'Failed to delete package');
      },
    },
  });

  const { mutate: updateStatus, isPending: isUpdating } =
    useUpdatePackageStatus();

  const handleStatusChange = (pkg: Package, status: PackageStatus) => {
    updateStatus(
      { id: pkg.id, status },
      {
        onSuccess: () =>
          toast.success(`Status updated to ${status} successfully`),
        onError: () => toast.error('Failed to update status'),
      },
    );
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = React.useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal =
        sortKey === 'sold' ? getSoldCount(a.id) : (a[sortKey] ?? '');
      const bVal =
        sortKey === 'sold' ? getSoldCount(b.id) : (b[sortKey] ?? '');
      const cmp =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((h, i) => (
                <TableHead key={`col-${i}`} className="text-sm font-semibold">
                  {h}
                </TableHead>
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
                <TableHead key={`col-${i}`} className="text-sm font-semibold">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="py-16 text-center">
                <p className="text-muted-foreground text-sm">
                  No packages found. Add your first package.
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
                    sorted.every((p) => selectedIds.has(p.id))
                      ? true
                      : sorted.some((p) => selectedIds.has(p.id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) =>
                    toggleAll(
                      sorted.map((p) => p.id),
                      checked === true,
                    )
                  }
                  aria-label="Select all packages"
                />
              </TableHead>
              <TableHead className="text-sm font-semibold">
                <div className="flex items-center">
                  Package <SortBtn col="name" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold md:table-cell">
                Content
              </TableHead>
              <TableHead className="text-sm font-semibold">
                <div className="flex items-center">
                  Price <SortBtn col="price" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="text-sm font-semibold">
                <div className="flex items-center">
                  Status <SortBtn col="status" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold sm:table-cell">
                <div className="flex items-center">
                  Sold <SortBtn col="sold" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((pkg) => {
              const isSelected = pkg.id === selectedId;
              return (
                <TableRow
                  key={pkg.id}
                  className={`hover:bg-muted/50 cursor-pointer transition-colors ${isSelected ? 'bg-muted' : ''}`}
                  onClick={() => onSelect?.(pkg)}
                  data-state={selectedIds.has(pkg.id) ? 'selected' : undefined}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(pkg.id)}
                      onCheckedChange={() => toggleRow(pkg.id)}
                      aria-label={`Select ${pkg.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="bg-muted relative h-20 w-[65px] shrink-0 overflow-hidden rounded-md">
                        {pkg.imageSrc ? (
                          <Image
                            src={pkg.imageSrc}
                            alt={pkg.name}
                            fill
                            sizes="65px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{pkg.name}</div>
                        {pkg.code && (
                          <div className="text-muted-foreground text-xs capitalize">
                            {pkg.code}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="text-muted-foreground line-clamp-2 max-w-xs text-sm">
                      {pkg.description || '-'}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatIDR(pkg.price)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="group relative cursor-pointer rounded focus:outline-none"
                          disabled={isUpdating}
                        >
                          <Badge
                            variant="secondary"
                            className={STATUS_CONFIG[pkg.status].className}
                          >
                            {STATUS_CONFIG[pkg.status].label}
                          </Badge>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {STATUS_OPTIONS.filter((s) => s !== pkg.status).map(
                          (s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => handleStatusChange(pkg, s)}
                            >
                              Set to{' '}
                              <span className="ml-1 capitalize">{s}</span>
                            </DropdownMenuItem>
                          ),
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {getSoldCount(pkg.id)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {onSelect && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSelect(pkg)}
                          title="View detail"
                        >
                          <EyeIcon className="size-5" />
                          <span className="sr-only">View</span>
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${pkg.name}`}
                          >
                            <CircleEllipsis className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/packages/${pkg.id}/edit`)
                            }
                          >
                            <PencilIcon className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(pkg)}
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

      <PackageDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        packageName={deleteTarget?.name ?? ''}
        onConfirm={() => deleteTarget && deletePackage({ id: deleteTarget.id })}
        isDeleting={isDeleting}
      />
    </>
  );
}
