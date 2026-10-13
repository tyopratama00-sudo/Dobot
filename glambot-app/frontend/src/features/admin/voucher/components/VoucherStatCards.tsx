'use client';

import React from 'react';
import { VoucherStats } from '../api/types';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { Ticket, CircleCheck, CirclePause } from 'lucide-react';

interface VoucherStatCardsProps {
  stats?: VoucherStats;
  isLoading?: boolean;
}

export function VoucherStatCards({ stats, isLoading }: VoucherStatCardsProps) {
  const cards = [
    {
      title: 'Total Vouchers',
      value: stats?.total ?? 0,
      icon: <Ticket className="size-7.5 text-[#8A38F5]" />,
      subtitle: 'Total registered vouchers',
      bgColor: 'bg-[#8A38F5]/20',
    },
    {
      title: 'Active',
      value: stats?.active ?? 0,
      icon: <CircleCheck className="size-7.5 text-[#12C964]" />,
      subtitle: `${stats?.active ?? 0} vouchers currently active`,
      bgColor: 'bg-[#12C964]/10',
    },
    {
      title: 'Inactive',
      value: stats?.inactive ?? 0,
      icon: <CirclePause className="size-7.5 text-[#FFCD29]" />,
      subtitle: `${stats?.inactive ?? 0} vouchers inactive`,
      bgColor: 'bg-[#FFCD29]/20',
    },
    {
      title: 'Total Used',
      value: stats?.totalUsed ?? 0,
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M13.6279 24.8376H21.7154C26.3404 24.8376 27.4904 23.6876 27.4904 19.0626C25.8904 19.0626 24.6029 17.7626 24.6029 16.1751C24.6029 14.5751 25.8904 13.2751 27.4904 13.2751V12.1251C27.4904 7.5001 26.3404 6.3501 21.7154 6.3501H13.7404V14.8376"
            stroke="#007DFC"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13.742 21.0875V24.8375H10.2795C8.42946 24.8375 7.34196 23.575 6.14196 20.675L5.91696 20.1125C7.42946 19.5125 8.16696 17.7625 7.52946 16.25C6.91696 14.7375 5.17946 14.0125 3.65446 14.6375L3.44196 14.1C1.64196 9.7 2.26696 8.1625 6.66696 6.35L9.96696 5L13.742 14.15V17.3375"
            stroke="#007DFC"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.2027 24.8376H9.99023"
            stroke="#007DFC"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      subtitle: 'Total voucher usage',
      bgColor: 'bg-[#007DFC]/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div key={index} className="bg-card flex gap-4 rounded-xl p-4">
          <div
            className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${card.bgColor}`}
          >
            {card.icon}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] leading-6.5 font-medium">
              {card.title}
            </span>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <span className="mt-px mb-px truncate text-[22px] leading-5 font-semibold">
                {card.value}
              </span>
            )}
            <span className="text-muted-foreground mt-px truncate text-xs">
              {card.subtitle}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
