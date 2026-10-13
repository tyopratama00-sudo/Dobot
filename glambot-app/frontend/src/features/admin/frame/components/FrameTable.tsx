'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowUpDown,
  CircleEllipsis,
  PencilIcon,
  Trash2Icon,
  EyeIcon,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Checkbox } from '@/components/admin/ui/checkbox';
import { Skeleton } from '@/components/admin/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { formatDateShort } from '@/lib/formats';
import { useRowSelection, useSortedRows } from '@/lib/useTableRows';
import { type Frame } from '../api/types';
import { FrameDeleteDialog } from './FrameDeleteDialog';
import { useDeleteFrame } from '../api/deleteFrame';
import { toast } from 'sonner';

type SortKey = 'name' | 'category' | 'status' | 'usedCount' | 'lastUsed';
type SortDir = 'asc' | 'desc';

type FrameTableProps = {
  data: Frame[];
  isLoading?: boolean;
  selectedId?: string | null;
  onSelect?: (frame: Frame) => void;
};

const COLUMNS = [
  '',
  'Frame',
  'Name',
  'Category',
  'Resolution',
  'Status',
  'Used',
  'Last Used',
  '',
];

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

export function FrameTable({
  data,
  isLoading,
  selectedId,
  onSelect,
}: FrameTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [sortDir, setSortDir] = React.useState<SortDir>('asc');
  const [deleteTarget, setDeleteTarget] = React.useState<Frame | null>(null);
  const { selectedIds, toggleRow, toggleAll } = useRowSelection();

  const { mutate: deleteFrame, isPending: isDeleting } = useDeleteFrame({
    mutationConfig: {
      onSuccess: () => {
        toast.success('Frame deleted successfully');
        setDeleteTarget(null);
      },
      onError: (error: Error) => {
        toast.error(error.message || 'Failed to delete frame');
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
                  No frames found. Add your first frame.
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
                    sorted.every((f) => selectedIds.has(f.id))
                      ? true
                      : sorted.some((f) => selectedIds.has(f.id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) =>
                    toggleAll(
                      sorted.map((f) => f.id),
                      checked === true,
                    )
                  }
                  aria-label="Select all frames"
                />
              </TableHead>
              <TableHead className="w-24 text-sm font-semibold">
                Frame
              </TableHead>
              <TableHead className="text-sm font-semibold">
                <div className="flex items-center">
                  Name <SortBtn col="name" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold sm:table-cell">
                <div className="flex items-center">
                  Category <SortBtn col="category" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold md:table-cell">
                Resolution
              </TableHead>
              <TableHead className="text-sm font-semibold">
                <div className="flex items-center">
                  Status <SortBtn col="status" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold lg:table-cell">
                <div className="flex items-center">
                  Used <SortBtn col="usedCount" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="hidden text-sm font-semibold xl:table-cell">
                <div className="flex items-center">
                  Last Used <SortBtn col="lastUsed" onClick={handleSort} />
                </div>
              </TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((frame) => {
              const isSelected = frame.id === selectedId;
              return (
                <TableRow
                  key={frame.id}
                  className={`hover:bg-muted/50 cursor-pointer transition-colors ${isSelected ? 'bg-muted' : ''}`}
                  onClick={() => onSelect?.(frame)}
                  data-state={selectedIds.has(frame.id) ? 'selected' : undefined}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(frame.id)}
                      onCheckedChange={() => toggleRow(frame.id)}
                      aria-label={`Select ${frame.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    {frame.thumbUrl || frame.filePath ? (
                      <div className="bg-muted relative h-16 w-12 overflow-hidden rounded-md border">
                        <Image
                          src={frame.thumbUrl || frame.filePath}
                          alt={frame.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="bg-muted h-16 w-12 rounded-md" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{frame.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {frame.frameCode}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80">
                      {frame.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {frame.canvasWidth}×{frame.canvasHeight}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        frame.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80'
                          : 'bg-rose-100 text-rose-800 hover:bg-rose-100/80'
                      }
                    >
                      {frame.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="font-medium">{frame.usedCount}</div>
                    <div className="text-muted-foreground text-xs">times</div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="text-sm">
                      {frame.lastUsed
                        ? formatDateShort(frame.lastUsed)
                        : '-'}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {onSelect && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onSelect(frame)}
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
                            onClick={(e) => e.stopPropagation()}
                          >
                            <CircleEllipsis className="size-5" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              router.push(`/frame/${frame.id}/edit`)
                            }
                          >
                            <PencilIcon className="mr-2 size-5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(frame)}
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

      <FrameDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        frameName={deleteTarget?.name ?? ''}
        onConfirm={() => deleteTarget && deleteFrame({ id: deleteTarget.id })}
        isPending={isDeleting}
      />
    </>
  );
}
