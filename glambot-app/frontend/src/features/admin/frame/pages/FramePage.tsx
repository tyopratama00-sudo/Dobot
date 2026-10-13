'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useListQueryParam } from '@/lib/useListQueryParam';
import { PlusCircleIcon } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';
import { DataPagination } from '@/components/admin/shared/DataPagination';
import { FrameStatCards } from '../components/FrameStatCards';
import { FrameTable } from '../components/FrameTable';
import { FrameDetailPanel } from '../components/FrameDetailPanel';
import { FrameFilters } from '../components/FrameFilters';
import {
  type Frame,
  type FrameCategory,
  type FrameStatus,
} from '../api/types';
import { useGetFrames } from '../api/getFrames';
import { useGetFrameStats } from '../api/getFrameStats';

export function FramePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const status = (searchParams.get('status') ?? 'all') as FrameStatus | 'all';
  const category = (searchParams.get('category') ?? 'all') as
    | FrameCategory
    | 'all';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');

  const [selectedFrameId, setSelectedFrameId] = React.useState<string | null>(
    null,
  );

  const updateParam = useListQueryParam('/frame');

  const { data: framesResponse, isLoading: isLoadingFrames } = useGetFrames({
    input: {
      page,
      limit: pageSize,
      search: search || undefined,
      status,
      category,
    },
  });
  const { data: stats, isLoading: isLoadingStats } = useGetFrameStats();

  const frames = React.useMemo(
    () => framesResponse?.data ?? [],
    [framesResponse],
  );
  const meta = framesResponse?.meta;
  const totalPages = meta?.lastPage ?? 1;
  const totalItems = meta?.total ?? 0;
  const currentPage = meta?.page ?? page;

  // Build category options from the current page's data — once useGetFrames
  // exposes a separate "facets" endpoint we can swap this out.
  const categoryOptions = React.useMemo(
    () =>
      Array.from(new Set(frames.map((f) => f.category))).sort() as FrameCategory[],
    [frames],
  );

  const selectedFrame = frames.find((f) => f.id === selectedFrameId) ?? null;

  const handleSelectFrame = (frame: Frame) => {
    setSelectedFrameId((prev) => (prev === frame.id ? null : frame.id));
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Setup Frame
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage Glambot Frame <br />
            Template and Frame Information
          </p>
        </div>
        <Button
          onClick={() => router.push('/frame/add-frame-photo')}
          className="gap-2 rounded-[8px] text-[16px] leading-6 font-normal"
        >
          Add Frame
          <PlusCircleIcon className="size-4" />
        </Button>
      </div>

      <FrameStatCards stats={stats} isLoading={isLoadingStats} />

      {/* Filters */}
      <FrameFilters
        search={search}
        onSearchChange={(v) => updateParam('search', v)}
        status={status}
        onStatusChange={(v) => updateParam('status', v)}
        category={category}
        onCategoryChange={(v) => updateParam('category', v)}
        categoryOptions={categoryOptions}
      />

      {/* Table + Detail Panel */}
      <div className="flex w-full items-start gap-6">
        <div className="flex w-full flex-col gap-4 overflow-hidden lg:flex-1">
          <div className="overflow-x-auto">
            <FrameTable
              data={frames}
              isLoading={isLoadingFrames}
              selectedId={selectedFrameId}
              onSelect={handleSelectFrame}
            />
          </div>

          <DataPagination
            total={totalItems}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={(p) => updateParam('page', String(p))}
            onPageSizeChange={(v) => updateParam('pageSize', String(v))}
            itemLabel="frames"
          />
        </div>

        <FrameDetailPanel frame={selectedFrame} />
      </div>
    </div>
  );
}
