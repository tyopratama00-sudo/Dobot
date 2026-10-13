'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { VoucherStats } from '../api/types';
import { PieChart, Pie, Tooltip, Label, type LabelProps } from 'recharts';
import { ChartContainer } from '@/components/admin/shared/ChartContainer';

interface VoucherChartProps {
  stats?: VoucherStats;
  isLoading?: boolean;
}

function ChartArea({
  stats,
  data,
}: {
  stats: VoucherStats;
  data: { name: string; value: number; fill: string }[];
}) {
  return (
    <ChartContainer className="mx-auto mt-8 h-75 w-full max-w-[320px]">
      {({ width, height }) => (
        <PieChart width={width} height={height}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={120}
            paddingAngle={2}
            dataKey="value"
          >
            <Label
              content={(props: LabelProps) => {
                const viewBox = props.viewBox as
                  | { cx?: number; cy?: number }
                  | undefined;
                if (!viewBox) return null;
                const cx = viewBox.cx ?? 0;
                const cy = viewBox.cy ?? 0;
                return (
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    <tspan
                      x={cx}
                      y={cy - 12}
                      className="fill-foreground text-[25px] leading-7 font-semibold"
                    >
                      {stats.total}
                    </tspan>
                    <tspan
                      x={cx}
                      y={cy + 16}
                      className="fill-muted-foreground text-[15px] leading-7 font-semibold"
                    >
                      Total
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
          <Tooltip
            formatter={(value) => [String(value), 'Count']}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #ccc',
              borderRadius: '8px',
            }}
          />
        </PieChart>
      )}
    </ChartContainer>
  );
}

export function VoucherChart({ stats, isLoading }: VoucherChartProps) {
  if (isLoading) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-80 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (
    !stats ||
    (stats.active === 0 && stats.inactive === 0 && stats.expired === 0)
  ) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-80 items-center justify-center">
            <p className="text-muted-foreground">No voucher data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = [
    { name: 'Active', value: stats.active, fill: '#12C964' },
    { name: 'Inactive', value: stats.inactive, fill: '#FFCD29' },
    { name: 'Expired', value: stats.expired, fill: '#D9D9D9' },
  ].filter((item) => item.value > 0);

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChartArea stats={stats} data={data} />

        <div className="flex flex-col gap-3">
          {data.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between gap-3 text-[15px] leading-5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <span className="text-foreground">{item.name}</span>
              </div>
              <span className="text-muted-foreground">
                {item.value} ({((item.value / stats.total) * 100).toFixed()}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
