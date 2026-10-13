'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';
import { ChartContainer } from '@/components/admin/shared/ChartContainer';
import { formatRupiah } from '@/lib/formats';
import { type SalesReport as SalesReportData } from '../api/types';

interface SalesReportProps {
  data: SalesReportData;
}

// Format ringkas untuk sumbu-Y nilai Rupiah (rb=ribu, jt=juta, M=miliar).
const formatCompact = (n: number) => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}jt`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}rb`;
  return String(n);
};

function Chart({ points }: { points: SalesReportData['data'] }) {
  return (
    <ChartContainer className="h-72 w-full">
      {({ width, height }) => (
        <BarChart
          width={width}
          height={height}
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#E5E7EB"
          />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#6B7280' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            domain={[0, 'auto']}
            width={48}
            tickFormatter={(v) => formatCompact(Number(v))}
            tick={{ fontSize: 12, fill: '#6B7280' }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="current" fill="#007DFC" radius={[4, 4, 0, 0]} />
          <Bar dataKey="previous" fill="#F5A6C5" radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ChartContainer>
  );
}

export function SalesReport({ data }: SalesReportProps) {
  const deltaUp = data.delta >= 0;
  const DeltaIcon = deltaUp ? ArrowUpIcon : ArrowDownIcon;

  return (
    <div className="bg-card flex min-w-0 flex-col gap-4 rounded-xl p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Sales Report</h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-semibold">
              Rp {formatRupiah(data.total)}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-sm font-medium ${
                deltaUp ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              <DeltaIcon className="size-3.5" />
              {`${deltaUp ? '+' : ''}${data.delta.toFixed(1)}%`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#007DFC]" />
            <span className="text-muted-foreground">This year</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#F5A6C5]" />
            <span className="text-muted-foreground">Last year</span>
          </div>
        </div>
      </div>

      <Chart points={data.data} />
    </div>
  );
}
