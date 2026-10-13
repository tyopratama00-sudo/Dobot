'use client';

import * as React from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/admin/ui/button';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { CameraCard } from '../components/CameraCard';
import { PrinterCard } from '../components/PrinterCard';
import { RobotCard } from '../components/RobotCard';
import { useGetDevices } from '../api/getDevices';

const formatTimestamp = (date: Date) =>
  date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function DevicesPage() {
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } =
    useGetDevices();

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Device Monitoring
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitor camera, printer, and robot status <br /> in real time
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh"
              className="rounded-[8px]"
            >
              <RefreshCwIcon
                className={`size-4 ${isFetching ? 'animate-spin' : ''}`}
              />
            </Button>
            <span className="text-sm font-medium">Refresh</span>
          </div>
          <span className="text-muted-foreground text-xs">
            {lastUpdated
              ? `Last updated ${formatTimestamp(lastUpdated)}`
              : 'Never updated'}
          </span>
        </div>
      </div>

      {isError ? (
        <div className="bg-card text-destructive rounded-xl border p-6 text-sm">
          Failed to load device status. Make sure the backend is running, then
          click Refresh.
        </div>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-[520px] rounded-xl" />
          <Skeleton className="h-[520px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <CameraCard data={data.camera} />
          <PrinterCard data={data.printer} />
          <RobotCard data={data.robot} />
        </div>
      )}
    </div>
  );
}
