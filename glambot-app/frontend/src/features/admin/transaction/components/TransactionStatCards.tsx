'use client';

import React from 'react';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { RevenueIcon } from '@/components/admin/shared/RevenueIcon';
import {
  ArrowDownIcon,
  ArrowUpIcon,
} from 'lucide-react';
import { type TransactionStats } from '../api/types';
import { formatIDR as formatCurrency } from '@/lib/formats';

interface TransactionStatCardsProps {
  stats?: TransactionStats;
  isLoading?: boolean;
}

function TrendText({ value, suffix }: { value: number; suffix: string }) {
  const isUp = value >= 0;
  const Icon = isUp ? ArrowUpIcon : ArrowDownIcon;
  return (
    <span className="mt-px flex items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${
          isUp
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-rose-100 text-rose-700'
        }`}
      >
        <Icon className="size-3" />
        {Math.round(Math.abs(value))}%
      </span>
      <span className="text-muted-foreground">{suffix}</span>
    </span>
  );
}

export function TransactionStatCards({
  stats,
  isLoading,
}: TransactionStatCardsProps) {
  const cards = [
    {
      title: 'Total Transaction',
      value: stats ? String(stats.total) : '0',
      changePct: stats?.totalChangePct ?? 0,
      changeLabel: 'from yesterday',
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M27.5 7.5V10.525C27.5 12.5 26.25 13.75 24.275 13.75H20V5.0125C20 3.625 21.1375 2.5 22.525 2.5C23.8875 2.5125 25.1375 3.0625 26.0375 3.9625C26.9375 4.875 27.5 6.125 27.5 7.5Z"
            stroke="#8A38F5"
            strokeWidth="2.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2.5 8.75V26.25C2.5 27.2875 3.67497 27.875 4.49997 27.25L6.6375 25.65C7.1375 25.275 7.83751 25.325 8.28751 25.775L10.3625 27.8625C10.85 28.35 11.65 28.35 12.1375 27.8625L14.2375 25.7625C14.675 25.325 15.375 25.275 15.8625 25.65L18 27.25C18.825 27.8625 20 27.275 20 26.25V5C20 3.625 21.125 2.5 22.5 2.5H8.75H7.5C3.75 2.5 2.5 4.7375 2.5 7.5V8.75Z"
            stroke="#8A38F5"
            strokeWidth="2.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7.5 11.25H15"
            stroke="#8A38F5"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.4375 16.25H14.0625"
            stroke="#8A38F5"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      bgColor: 'bg-[#8A38F5]/20',
    },
    {
      title: 'Revenue',
      value: stats ? formatCurrency(stats.revenue) : formatCurrency(0),
      changePct: stats?.revenueChangePct ?? 0,
      changeLabel: 'from yesterday',
      icon: <RevenueIcon />,
      bgColor: 'bg-[#12C964]/20',
    },
    {
      title: 'Successful',
      value: stats ? String(stats.successful) : '0',
      changePct: stats?.successfulChangePct ?? 0,
      changeLabel: 'overall',
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M11.25 23.75C11.25 24.6875 10.9875 25.575 10.525 26.325C9.6625 27.775 8.075 28.75 6.25 28.75C4.425 28.75 2.8375 27.775 1.975 26.325C1.5125 25.575 1.25 24.6875 1.25 23.75C1.25 20.9875 3.4875 18.75 6.25 18.75C9.0125 18.75 11.25 20.9875 11.25 23.75Z"
            stroke="#007DFC"
            strokeWidth="1.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.30176 23.7494L5.53926 24.9869L8.20176 22.5244"
            stroke="#007DFC"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M22.1893 8.81246C21.8893 8.76246 21.5768 8.74998 21.2518 8.74998H8.75176C8.40176 8.74998 8.06426 8.77497 7.73926 8.82497C7.91426 8.47497 8.16426 8.15001 8.46426 7.85001L12.5268 3.775C14.2393 2.075 17.0143 2.075 18.7268 3.775L20.9143 5.98745C21.7143 6.77495 22.1393 7.77496 22.1893 8.81246Z"
            stroke="#007DFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M27.5 15V21.25C27.5 25 25 27.5 21.25 27.5H9.5375C9.925 27.175 10.2625 26.775 10.525 26.325C10.9875 25.575 11.25 24.6875 11.25 23.75C11.25 20.9875 9.0125 18.75 6.25 18.75C4.75 18.75 3.4125 19.4125 2.5 20.45V15C2.5 11.6 4.55 9.225 7.7375 8.825C8.0625 8.775 8.4 8.75 8.75 8.75H21.25C21.575 8.75 21.8875 8.76248 22.1875 8.81248C25.4125 9.18748 27.5 11.575 27.5 15Z"
            stroke="#007DFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M27.5 15.625H23.75C22.375 15.625 21.25 16.75 21.25 18.125C21.25 19.5 22.375 20.625 23.75 20.625H27.5"
            stroke="#007DFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      bgColor: 'bg-[#007DFC]/20',
    },
    {
      title: 'Failed',
      value: stats ? String(stats.failed) : '0',
      changePct: stats?.failedChangePct ?? 0,
      changeLabel: 'overall',
      icon: (
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22.55 16.9375C22.025 17.45 21.725 18.1875 21.8 18.975C21.9125 20.325 23.15 21.3125 24.5 21.3125H26.875V22.8C26.875 25.3875 24.7625 27.5 22.175 27.5H9.5375C9.925 27.175 10.2625 26.775 10.525 26.325C10.9875 25.575 11.25 24.6875 11.25 23.75C11.25 20.9875 9.0125 18.75 6.25 18.75C5.075 18.75 3.9875 19.1625 3.125 19.85V14.3875C3.125 11.8 5.2375 9.6875 7.825 9.6875H22.175C24.7625 9.6875 26.875 11.8 26.875 14.3875V16.1875H24.35C23.65 16.1875 23.0125 16.4625 22.55 16.9375Z"
            stroke="#EB4229"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.125 15.5126V9.80019C3.125 8.31269 4.0375 6.98764 5.425 6.46264L15.35 2.71264C16.9 2.12514 18.5625 3.27517 18.5625 4.93767V9.68766"
            stroke="#EB4229"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M28.1985 17.4624V20.0375C28.1985 20.725 27.6485 21.2875 26.9485 21.3125H24.4985C23.1485 21.3125 21.911 20.325 21.7985 18.975C21.7235 18.1875 22.0235 17.45 22.5485 16.9375C23.011 16.4625 23.6485 16.1875 24.3485 16.1875H26.9485C27.6485 16.2125 28.1985 16.7749 28.1985 17.4624Z"
            stroke="#EB4229"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.75 15H17.5"
            stroke="#EB4229"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.25 23.75C11.25 24.6875 10.9875 25.575 10.525 26.325C10.2625 26.775 9.925 27.175 9.5375 27.5C8.6625 28.2875 7.5125 28.75 6.25 28.75C4.425 28.75 2.8375 27.775 1.975 26.325C1.5125 25.575 1.25 24.6875 1.25 23.75C1.25 22.175 1.975 20.7625 3.125 19.85C3.9875 19.1625 5.075 18.75 6.25 18.75C9.0125 18.75 11.25 20.9875 11.25 23.75Z"
            stroke="#EB4229"
            strokeWidth="1.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7.5875 25.0501L4.9375 22.4126"
            stroke="#EB4229"
            strokeWidth="1.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7.5626 22.4497L4.9126 25.0872"
            stroke="#EB4229"
            strokeWidth="1.5"
            strokeMiterlimit="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      bgColor: 'bg-[#F5383B]/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <div key={index} className="bg-card flex gap-4 rounded-xl p-4">
          <div
            className={`flex size-12 items-center justify-center rounded-xl ${card.bgColor}`}
          >
            {card.icon}
          </div>
          <div className="items-center-center flex flex-col">
            <span className="text-[15px] leading-6.5 font-medium sm:text-sm">
              {card.title}
            </span>
            {isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <span className="mt-px mb-px text-[22px] leading-5 font-semibold">
                {card.value}
              </span>
            )}
            {isLoading ? (
              <Skeleton className="mt-1 h-3 w-20" />
            ) : (
              <TrendText value={card.changePct} suffix={card.changeLabel} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
