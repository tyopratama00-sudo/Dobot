'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useListQueryParam } from '@/lib/useListQueryParam';
import { PlusCircleIcon } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';
import { DataPagination } from '@/components/admin/shared/DataPagination';
import { PackageTable } from '../components/PackageTable';
import { PackageFilters } from '../components/PackageFilters';
import { PackageStatCards } from '../components/PackageStatCards';
import { PackageDetailPanel } from '../components/PackageDetailPanel';
import {
  type Package,
  type PackageCode,
  type PackageStatus,
} from '../api/types';
import { useGetPackages } from '../api/getPackages';
import { useGetPackageStats } from '../api/getPackageStats';

export function PackagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') ?? 'all') as PackageStatus | 'all';
  const code = (searchParams.get('code') ?? 'all') as PackageCode | 'all';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');

  const [selectedPackageId, setSelectedPackageId] = React.useState<
    number | null
  >(null);

  const updateParam = useListQueryParam('/packages');

  const { data: packagesResponse, isLoading: isLoadingPackages } =
    useGetPackages({
      input: {
        page,
        limit: pageSize,
        search: search || undefined,
        status,
        code,
      },
    });
  const { data: stats, isLoading: isLoadingStats } = useGetPackageStats();

  const packages = packagesResponse?.data ?? [];
  const meta = packagesResponse?.meta;
  const totalPages = meta?.lastPage ?? 1;
  const totalItems = meta?.total ?? 0;
  const currentPage = meta?.page ?? page;

  const selectedPackage =
    packages.find((p) => p.id === selectedPackageId) ?? null;

  const handleSelectPackage = (pkg: Package) => {
    setSelectedPackageId((prev) => (prev === pkg.id ? null : pkg.id));
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Packages
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage photo packages, prices, <br /> and package content details
          </p>
        </div>

        <Button
          onClick={() => router.push('/packages/add-photo-package')}
          className="gap-2 rounded-[8px] text-[16px] leading-6"
        >
          Add Package
          <PlusCircleIcon className="size-4" />
        </Button>
      </div>

      {/* Stat Cards */}
      <PackageStatCards stats={stats} isLoading={isLoadingStats} />

      {/* Filters */}
      <PackageFilters
        search={search}
        onSearchChange={(v) => updateParam('search', v)}
        status={status}
        onStatusChange={(v) => updateParam('status', v)}
        code={code}
        onCodeChange={(v) => updateParam('code', v)}
      />

      {/* Table + Detail Panel */}
      <div className="flex w-full items-start gap-6">
        <div className="flex w-full flex-col gap-4 overflow-hidden lg:flex-1">
          <div className="overflow-x-auto">
            <PackageTable
              data={packages}
              isLoading={isLoadingPackages}
              selectedId={selectedPackageId}
              onSelect={handleSelectPackage}
            />
          </div>

          <DataPagination
            total={totalItems}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={(p) => updateParam('page', String(p))}
            onPageSizeChange={(v) => updateParam('pageSize', String(v))}
            itemLabel="packages"
          />
        </div>

        <PackageDetailPanel pkg={selectedPackage} />
      </div>
    </div>
  );
}
