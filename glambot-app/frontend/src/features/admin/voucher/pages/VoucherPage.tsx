'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useListQueryParam } from '@/lib/useListQueryParam';
import { Plus } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';
import { DataPagination } from '@/components/admin/shared/DataPagination';
import { VoucherStatCards } from '../components/VoucherStatCards';
import { VoucherChart } from '../components/VoucherChart';
import { VoucherFilters } from '../components/VoucherFilters';
import { VoucherTable } from '../components/VoucherTable';
import { useGetVouchers } from '../api/getVouchers';
import { useGetVoucherStats } from '../api/getVoucherStats';
import type { DiscountType, VoucherStatusFilter } from '../api/types';
import { Card, CardContent } from '@/components/admin/ui/card';

export function VoucherPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') ?? 'all') as VoucherStatusFilter;
  const discountType = (searchParams.get('discountType') ?? 'all') as
    | DiscountType
    | 'all';
  const month = searchParams.get('month') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');

  const updateParam = useListQueryParam('/voucher');

  const { data: vouchersResponse, isLoading: isLoadingVouchers } =
    useGetVouchers({
      input: {
        page,
        limit: pageSize,
        search: search || undefined,
        status,
        discountType,
        month: month === 'all' ? 'all' : Number(month),
      },
    });
  const { data: stats, isLoading: isLoadingStats } = useGetVoucherStats();

  const vouchers = vouchersResponse?.data ?? [];
  const meta = vouchersResponse?.meta;
  const totalPages = meta?.lastPage ?? 1;
  const totalItems = meta?.total ?? 0;
  const currentPage = meta?.page ?? page;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Manage Voucher
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Generate new voucher, and <br /> organize voucher.
          </p>
        </div>
        <Button
          onClick={() => router.push('/voucher/generate-new-voucher')}
          className="gap-2 rounded-[8px] text-[16px] leading-6"
        >
          <Plus className="size-4" />
          Generate Voucher
        </Button>
      </div>

      <VoucherStatCards stats={stats} isLoading={isLoadingStats} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <VoucherFilters
            search={search}
            onSearchChange={(v) => updateParam('search', v)}
            status={status}
            onStatusChange={(v) => updateParam('status', v)}
            discountType={discountType}
            onDiscountTypeChange={(v) => updateParam('discountType', v)}
            month={month}
            onMonthChange={(v) => updateParam('month', v)}
          />

          <div className="overflow-x-auto">
            <VoucherTable data={vouchers} isLoading={isLoadingVouchers} />
          </div>

          <DataPagination
            total={totalItems}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={(p) => updateParam('page', String(p))}
            onPageSizeChange={(v) => updateParam('pageSize', String(v))}
            itemLabel="vouchers"
          />
        </div>

        <div className="space-y-4">
          <VoucherChart stats={stats} isLoading={isLoadingStats} />

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-full bg-blue-500 text-white">
                  <span className="text-xs font-bold">i</span>
                </div>
                <h3 className="font-semibold text-blue-900">Tips</h3>
              </div>
              <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-blue-800">
                <li>
                  Make a voucher specific to a certain event so it is easier to
                  track.
                </li>
                <li>
                  Deactivate vouchers that are no longer valid so users do not
                  get confused.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
