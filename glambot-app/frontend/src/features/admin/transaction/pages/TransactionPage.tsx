'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useListQueryParam } from '@/lib/useListQueryParam';
import { FileDown, FileText, Sheet, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/admin/ui/dropdown-menu';
import { DataPagination } from '@/components/admin/shared/DataPagination';
import { TransactionFilters } from '../components/TransactionFilters';
import { TransactionStatCards } from '../components/TransactionStatCards';
import { TransactionTable } from '../components/TransactionTable';
import { TransactionDetailPanel } from '../components/TransactionDetailPanel';
import { type Transaction, type TransactionStatus } from '../api/types';
import { getTransactions, useGetTransactions } from '../api/getTransactions';
import { useGetTransactionStats } from '../api/getTransactionStats';
import { exportTransactionsToPDF } from '../utils/exportToPDF';
import { exportTransactionsToExcel } from '../utils/exportToExcel';

export function TransactionPage() {
  const searchParams = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') ?? 'all') as
    | TransactionStatus
    | 'all';
  const month = searchParams.get('month') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');

  const [selectedTransactionId, setSelectedTransactionId] = React.useState<
    string | null
  >(null);
  const [isExporting, setIsExporting] = React.useState(false);

  const updateParam = useListQueryParam('/transaction');

  const { data: transactionsResponse, isLoading: isLoadingTransactions } =
    useGetTransactions({
      input: {
        page,
        limit: pageSize,
        search: search || undefined,
        status,
        month: month === 'all' ? 'all' : Number(month),
      },
    });
  const { data: stats, isLoading: isLoadingStats } = useGetTransactionStats();

  const transactions = transactionsResponse?.data ?? [];
  const meta = transactionsResponse?.meta;
  const totalPages = meta?.lastPage ?? 1;
  const totalItems = meta?.total ?? 0;
  const currentPage = meta?.page ?? page;

  const selectedTransaction =
    transactions.find((t) => t.id === selectedTransactionId) ?? null;

  const handleSelectTransaction = (trx: Transaction) => {
    setSelectedTransactionId((prev) => (prev === trx.id ? null : trx.id));
  };

  const fetchAllForExport = async (): Promise<Transaction[]> => {
    const result = await getTransactions({
      limit: 5000,
      search: search || undefined,
      status,
      month: month === 'all' ? 'all' : Number(month),
    });
    return result.data;
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const all = await fetchAllForExport();
      await exportTransactionsToPDF(all, {
        status: status !== 'all' ? status : undefined,
        search: search || undefined,
      });
      toast.success(`PDF generated successfully (${all.length} transactions)`);
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const all = await fetchAllForExport();
      exportTransactionsToExcel(all);
      toast.success(`Excel generated successfully (${all.length} transactions)`);
    } catch {
      toast.error('Failed to generate Excel');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Transactions
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage all glambot photo <br /> transaction.
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={isExporting}
              className="gap-2 rounded-[8px] text-[16px] leading-6"
            >
              {isExporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              {isExporting ? 'Processing…' : 'Export'}
              {!isExporting && <ChevronDown className="size-3.5 opacity-70" />}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Select Export Format</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer">
              <FileText className="size-4 text-red-500" />
              Export PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer">
              <Sheet className="size-4 text-green-600" />
              Export Excel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TransactionStatCards stats={stats} isLoading={isLoadingStats} />

      <div className="flex w-full items-start gap-6">
        <div className="flex w-full flex-col gap-4 overflow-hidden lg:flex-1">
          <TransactionFilters
            search={search}
            onSearchChange={(v) => updateParam('search', v)}
            status={status}
            onStatusChange={(v) => updateParam('status', v)}
            month={month}
            onMonthChange={(v) => updateParam('month', v)}
          />

          <div className="overflow-x-auto">
            <TransactionTable
              data={transactions}
              isLoading={isLoadingTransactions}
              selectedId={selectedTransactionId}
              onSelect={handleSelectTransaction}
            />
          </div>

          <DataPagination
            total={totalItems}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={(p) => updateParam('page', String(p))}
            onPageSizeChange={(v) => updateParam('pageSize', String(v))}
            itemLabel="transactions"
          />
        </div>

        <TransactionDetailPanel transaction={selectedTransaction} />
      </div>
    </div>
  );
}
