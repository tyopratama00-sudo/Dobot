'use client';

import React from 'react';
import {
  Wallet,
  Users,
  Ticket,
  Frame as FrameIcon,
  ArrowUpIcon,
  ArrowDownIcon,
} from 'lucide-react';
import { Area, AreaChart } from 'recharts';
import { ChartContainer } from '@/components/admin/shared/ChartContainer';
import { type KpiCardData } from '../api/types';

interface KpiCardsProps {
  data: KpiCardData[];
}

const ICONS: Record<KpiCardData['key'], React.ReactNode> = {
  revenue: <Wallet className="size-5 text-[#007DFC]" />,
  customers: <Users className="size-5 text-[#8A38F5]" />,
  voucher: <Ticket className="size-5 text-[#FFCD29]" />,
  frames: <FrameIcon className="size-5 text-[#12C964]" />,
};

const ICON_BG: Record<KpiCardData['key'], string> = {
  revenue: 'bg-[#007DFC]/15',
  customers: 'bg-[#8A38F5]/15',
  voucher: 'bg-[#FFCD29]/15',
  frames: 'bg-[#12C964]/15',
};

const SPARK_COLOR = '#007DFC';

function Sparkline({
  data,
  gradientId,
}: {
  data: KpiCardData['trend'];
  gradientId: string;
}) {
  return (
    <ChartContainer className="h-12 w-full">
      {({ width, height }) => (
        <AreaChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={SPARK_COLOR} stopOpacity={1} />
              <stop offset="100%" stopColor={SPARK_COLOR} stopOpacity={0.8} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            fill={SPARK_COLOR}
            fillOpacity={0.05}
            isAnimationActive={false}
          />
        </AreaChart>
      )}
    </ChartContainer>
  );
}

export function KpiCards({ data }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {data.map((card) => {
        const isUp = card.changePct >= 0;
        const Icon = isUp ? ArrowUpIcon : ArrowDownIcon;
        return (
          <div
            key={card.key}
            className="bg-card flex min-w-0 flex-col gap-3 rounded-xl p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-muted-foreground truncate text-sm">
                  {card.title}
                </span>
                <span className="truncate text-2xl leading-7 font-semibold">
                  {card.value}
                </span>
              </div>
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${ICON_BG[card.key]}`}
              >
                {ICONS[card.key]}
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${
                  isUp
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <Icon className="size-3" />
                {Math.round(Math.abs(card.changePct))}%
              </span>
              <span className="text-muted-foreground">{card.changeLabel}</span>
            </div>

            <Sparkline
              data={card.trend}
              gradientId={`spark-stroke-${card.key}`}
            />
          </div>
        );
      })}
    </div>
  );
}

