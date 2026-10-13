'use client';

import React from 'react';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { RevenueIcon } from '@/components/admin/shared/RevenueIcon';
import { CirclePause } from 'lucide-react';
import { type PackageStats } from '../api/types';

interface PackageStatCardsProps {
  stats?: PackageStats;
  isLoading?: boolean;
}

export function PackageStatCards({
  stats,
  isLoading,
}: PackageStatCardsProps) {
  const active = stats?.active ?? 0;
  const inactive = stats?.inactive ?? 0;
  const soldToday = stats?.soldToday ?? 0;
  const revenueToday = stats?.revenueToday ?? 0;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);

  const cards = [
    {
      title: 'Active Package',
      value: active,
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10.5 8.125H19.5C23.75 8.125 24.175 10.1125 24.4625 12.5375L25.5875 21.9125C25.95 24.9875 25 27.5 20.625 27.5H9.38753C5.00003 27.5 4.05003 24.9875 4.42503 21.9125L5.55004 12.5375C5.82504 10.1125 6.25003 8.125 10.5 8.125Z"
            stroke="#8A38F5"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 10V5.625C10 3.75 11.25 2.5 13.125 2.5H16.875C18.75 2.5 20 3.75 20 5.625V10"
            stroke="#8A38F5"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M25.5125 21.2876H10"
            stroke="#8A38F5"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      subtitle: `${active} packages currently active`,
      bgColor: 'bg-[#8A38F5]/20',
    },
    {
      title: 'Sold Today',
      value: soldToday,
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.5 2.5H4.67501C6.02501 2.5 7.0875 3.6625 6.975 5L5.9375 17.45C5.7625 19.4875 7.37499 21.2375 9.42499 21.2375H22.7375C24.5375 21.2375 26.1125 19.7625 26.25 17.975L26.925 8.60001C27.075 6.52501 25.5 4.83749 23.4125 4.83749H7.27501"
            stroke="#007DFC"
            strokeWidth="2"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20.3125 27.5C21.1754 27.5 21.875 26.8004 21.875 25.9375C21.875 25.0746 21.1754 24.375 20.3125 24.375C19.4496 24.375 18.75 25.0746 18.75 25.9375C18.75 26.8004 19.4496 27.5 20.3125 27.5Z"
            stroke="#007DFC"
            strokeWidth="1.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.3125 27.5C11.1754 27.5 11.875 26.8004 11.875 25.9375C11.875 25.0746 11.1754 24.375 10.3125 24.375C9.44956 24.375 8.75 25.0746 8.75 25.9375C8.75 26.8004 9.44956 27.5 10.3125 27.5Z"
            stroke="#007DFC"
            strokeWidth="1.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.25 10H26.25"
            stroke="#007DFC"
            strokeWidth="2"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      subtitle: 'Packages sold today',
      bgColor: 'bg-[#007DFC]/20',
    },
    {
      title: 'Revenue',
      value: formatCurrency(revenueToday),
      icon: <RevenueIcon />,
      subtitle: "Today's revenue",
      bgColor: 'bg-[#12C964]/20',
    },
    {
      title: 'Inactive Package',
      value: inactive,
      icon: <CirclePause className="size-7.5 text-[#FFCD29]" />,
      subtitle: `${inactive} packages inactive`,
      bgColor: 'bg-[#FFCD29]/20',
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
