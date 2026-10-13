'use client';

import * as React from 'react';
import { ArrowDownCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { KpiCards } from '../components/KpiCards';
import { SalesReport } from '../components/SalesReport';
import { RecentOrderTable } from '../components/RecentOrderTable';
import { TopList } from '../components/TopList';
import { useGetDashboardSummary } from '../api/getDashboardSummary';
import { exportDashboardToPDF } from '../utils/exportToPDF';

export function DashboardPage() {
  const { data: summary, isLoading, isError } = useGetDashboardSummary();
  const [isDownloading, setIsDownloading] = React.useState(false);

  const handleDownload = async () => {
    if (!summary) {
      toast.error('Dashboard data is not available yet');
      return;
    }
    setIsDownloading(true);
    try {
      await exportDashboardToPDF(summary);
      toast.success('PDF report downloaded successfully');
    } catch {
      toast.error('Failed to generate PDF report');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-xl leading-7 md:text-2xl">
            Welcome back, Admin
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Here is what going on in your <br /> store
          </p>
        </div>
        <Button
          onClick={handleDownload}
          disabled={isDownloading || isLoading || !summary}
          className="gap-2 rounded-[8px] text-[16px] leading-6"
        >
          {isDownloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowDownCircle className="size-4" />
          )}
          {isDownloading ? 'Generating PDF…' : 'Download Report'}
        </Button>
      </div>

      {isError ? (
        <div className="bg-card text-destructive rounded-xl border p-6 text-sm">
          Failed to load dashboard summary. Try reloading the page.
        </div>
      ) : isLoading || !summary ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* KPI Cards */}
          <KpiCards data={summary.kpis} />

          {/* Main grid: left column (sales + recent order), right column (top lists) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <SalesReport data={summary.salesReport} />
              <RecentOrderTable data={summary.recentOrders} />
            </div>

            <div className="flex flex-col gap-4">
              <TopList
                title="Top Frame Used by Sales"
                items={summary.topFrames}
              />
              <TopList title="Top Product" items={summary.topProducts} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-60 rounded-xl" />
        </div>
      </div>
    </>
  );
}
