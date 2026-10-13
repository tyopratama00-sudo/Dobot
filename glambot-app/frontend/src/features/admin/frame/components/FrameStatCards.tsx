import React from 'react';
import { FrameStats } from '../api/types';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { ShieldCheck, ShieldX } from 'lucide-react';

interface FrameStatCardsProps {
  stats: FrameStats | undefined;
  isLoading: boolean;
}

export function FrameStatCards({ stats, isLoading }: FrameStatCardsProps) {
  const total = Number(stats?.total ?? 0);
  const active = Number(stats?.active ?? 0);
  const inactive = Number(stats?.inactive ?? 0);
  const usedToday = Number(stats?.usedToday ?? 0);

  const cards = [
    {
      title: 'Total Frame',
      value: total,
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11.25 27.5H18.75C25 27.5 27.5 25 27.5 18.75V11.25C27.5 5 25 2.5 18.75 2.5H11.25C5 2.5 2.5 5 2.5 11.25V18.75C2.5 25 5 27.5 11.25 27.5Z"
            stroke="#8A38F5"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.25 2.5L17.4375 27.5"
            stroke="#8A38F5"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14.4125 15.2749L2.5 18.7499"
            stroke="#8A38F5"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      subtitle: 'Total frames available',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Active Frame',
      value: active,
      icon: <ShieldCheck className="size-7.5 text-green-500" />,
      subtitle: `${total ? Math.round((active / total) * 100) : 0}% of total — frames currently active`,
      bgColor: 'bg-[#12C964]/10',
    },
    {
      title: 'Inactive Frame',
      value: inactive,
      icon: <ShieldX className="size-7.5 text-red-500" />,
      subtitle: `${total ? Math.round((inactive / total) * 100) : 0}% of total — frames inactive`,
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Used Today',
      value: usedToday,
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11.25 12.5C12.6307 12.5 13.75 11.3807 13.75 10C13.75 8.61929 12.6307 7.5 11.25 7.5C9.86929 7.5 8.75 8.61929 8.75 10C8.75 11.3807 9.86929 12.5 11.25 12.5Z"
            stroke="#007DFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16.25 2.5H11.25C5 2.5 2.5 5 2.5 11.25V18.75C2.5 25 5 27.5 11.25 27.5H18.75C25 27.5 27.5 25 27.5 18.75V12.5"
            stroke="#007DFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 6.2375L21.825 8.0625L26.7 3.1875"
            stroke="#007DFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.3374 23.6875L9.4999 19.55C10.4874 18.8875 11.9124 18.9625 12.7999 19.725L13.2124 20.0875C14.1874 20.925 15.7624 20.925 16.7374 20.0875L21.9374 15.625C22.9124 14.7875 24.4874 14.7875 25.4624 15.625L27.4999 17.375"
            stroke="#007DFC"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      subtitle: 'Photo sessions using a frame today',
      bgColor: 'bg-blue-500/10',
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
