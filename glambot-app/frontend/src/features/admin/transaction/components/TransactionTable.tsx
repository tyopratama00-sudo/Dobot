'use client';

import * as React from 'react';
import { ArrowUpDown, EyeIcon } from 'lucide-react';
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
import { type Transaction } from '../api/types';
import {
  formatIDR as formatCurrency,
  formatDateTimeShort as formatDateTime,
} from '@/lib/formats';
import { useRowSelection } from '@/lib/useTableRows';
import { TRANSACTION_STATUS_CONFIG } from '../utils/status';

type SortKey = 'id' | 'package' | 'amount' | 'createdAt' | 'status';
type SortDir = 'asc' | 'desc';

type TransactionTableProps = {
  data: Transaction[];
  isLoading?: boolean;
  selectedId?: string | null;
  onSelect?: (transaction: Transaction) => void;
};

const COLUMNS = [
  '',
  'Transaction ID',
  'Package',
  'Type',
  'Amount',
  'Time',
  'Status',
  '',
];

const STATUS_CONFIG = TRANSACTION_STATUS_CONFIG;

const TYPE_CONFIG: Record<string, string> = {
  digital: 'bg-blue-100 text-blue-800 hover:bg-blue-100/80',
  'digital+print': 'bg-purple-100 text-purple-800 hover:bg-purple-100/80',
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

export function TransactionTable({
  data,
  isLoading,
  selectedId,
  onSelect,
}: TransactionTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const { selectedIds, toggleRow, toggleAll } = useRowSelection();

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
      let aVal: string | number;
      let bVal: string | number;
      switch (sortKey) {
        case 'package':
          aVal = a.package?.name ?? '';
          bVal = b.package?.name ?? '';
          break;
        case 'amount':
          aVal = a.amount;
          bVal = b.amount;
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          aVal = a.id;
          bVal = b.id;
      }
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
                  No transactions found.
                </p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={
                  sorted.length > 0 &&
                  sorted.every((t) => selectedIds.has(t.id))
                    ? true
                    : sorted.some((t) => selectedIds.has(t.id))
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(checked) =>
                  toggleAll(
                    sorted.map((t) => t.id),
                    checked === true,
                  )
                }
                aria-label="Select all transactions"
              />
            </TableHead>
            <TableHead className="text-sm font-semibold">
              <div className="flex items-center">
                Transaction ID <SortBtn col="id" onClick={handleSort} />
              </div>
            </TableHead>
            <TableHead className="text-sm font-semibold">
              <div className="flex items-center">
                Package <SortBtn col="package" onClick={handleSort} />
              </div>
            </TableHead>
            <TableHead className="hidden text-sm font-semibold sm:table-cell">
              Type
            </TableHead>
            <TableHead className="text-sm font-semibold">
              <div className="flex items-center">
                Amount <SortBtn col="amount" onClick={handleSort} />
              </div>
            </TableHead>
            <TableHead className="hidden text-sm font-semibold md:table-cell">
              <div className="flex items-center">
                Time <SortBtn col="createdAt" onClick={handleSort} />
              </div>
            </TableHead>
            <TableHead className="text-sm font-semibold">
              <div className="flex items-center">
                Status <SortBtn col="status" onClick={handleSort} />
              </div>
            </TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((trx) => {
            const isSelected = trx.id === selectedId;
            const typeLabel = trx.package?.type ?? 'digital';
            return (
              <TableRow
                key={trx.id}
                className={`hover:bg-muted/50 cursor-pointer transition-colors ${isSelected ? 'bg-muted' : ''}`}
                onClick={() => onSelect?.(trx)}
                data-state={selectedIds.has(trx.id) ? 'selected' : undefined}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(trx.id)}
                    onCheckedChange={() => toggleRow(trx.id)}
                    aria-label={`Select transaction ${trx.id}`}
                  />
                </TableCell>
                <TableCell className="font-mono text-sm">{trx.id}</TableCell>
                <TableCell>
                  <div className="font-medium">
                    {trx.package?.name ?? '-'}
                  </div>
                  {trx.package?.code && (
                    <div className="text-muted-foreground text-xs capitalize">
                      {trx.package.code}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge
                    variant="secondary"
                    className={TYPE_CONFIG[typeLabel] ?? TYPE_CONFIG.digital}
                  >
                    {typeLabel === 'digital+print'
                      ? 'Digital + Print'
                      : 'Digital'}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {formatCurrency(trx.amount)}
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {formatDateTime(trx.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={STATUS_CONFIG[trx.status].className}
                  >
                    {STATUS_CONFIG[trx.status].label}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end">
                    {onSelect && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onSelect(trx)}
                        title="View detail"
                      >
                        <EyeIcon className="size-5" />
                        <span className="sr-only">View</span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
