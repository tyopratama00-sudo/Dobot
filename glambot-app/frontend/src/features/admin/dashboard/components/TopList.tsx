'use client';

import React from 'react';
import { type TopListItem } from '../api/types';

interface TopListProps {
  title: string;
  items: TopListItem[];
}

export function TopList({ title, items }: TopListProps) {
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl p-6">
      <h3 className="text-base font-semibold">{title}</h3>

      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Belum ada data
          </p>
        ) : (
          items.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              {/* Badge peringkat (#1–#5) — info nyata, bukan indikator tren palsu */}
              <span className="bg-[#007DFC]/10 text-[#007DFC] flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {item.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {item.used} Used
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
