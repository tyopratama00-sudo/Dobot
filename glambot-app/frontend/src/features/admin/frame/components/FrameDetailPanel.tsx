import React from 'react';
import { formatDateShort } from '@/lib/formats';
import { Frame } from '../api/types';
import Image from 'next/image';
import { Badge } from '@/components/admin/ui/badge';
import { CalendarIcon, TrendingUpIcon, MonitorIcon } from 'lucide-react';

interface FrameDetailPanelProps {
  frame: Frame | null;
}

export function FrameDetailPanel({ frame }: FrameDetailPanelProps) {
  if (!frame) return null;

  return (
    <div className="hidden shrink-0 flex-col gap-4 lg:flex lg:w-80 xl:w-md">
      <div className="text-lg font-semibold">Frame Detail</div>
      <div className="bg-card flex flex-col gap-6 rounded-xl border p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center">
          <div className="flex flex-col gap-4 xl:w-1/2">
            <div className="bg-muted relative mx-auto aspect-1080/1920 w-full max-w-40 overflow-hidden rounded-lg border">
              {frame.filePath ? (
                <Image
                  src={frame.filePath}
                  alt={frame.name}
                  fill
                  className="object-contain"
                  unoptimized
                />
              ) : (
                <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                  No Image
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <Badge
                variant={frame.status === 'active' ? 'default' : 'secondary'}
                className={`w-full justify-center ${frame.status === 'active' ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80' : 'bg-rose-100 text-rose-800 hover:bg-rose-100/80'}`}
              >
                {frame.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:w-1/2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center gap-2">
                <MonitorIcon className="size-4 text-blue-500" />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xl font-bold text-blue-500">
                  {frame.usedCount}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Timed Used
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center gap-2">
                <TrendingUpIcon className="size-4 text-purple-500" />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-xl font-bold text-purple-500">
                  {frame.usedToday}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Used Today
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-muted-foreground flex items-center gap-2">
                <CalendarIcon className="size-4 text-amber-500" />
              </div>
              <div className="flex flex-col items-end">
                <span className="font-semibold">
                  {frame.lastUsed
                    ? formatDateShort(frame.lastUsed)
                    : '-'}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Last Used
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Frame Name</span>
            <span className="text-right font-medium">{frame.name}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Frame Code</span>
            <span className="text-right font-medium">{frame.frameCode}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Category</span>
            <span className="text-right font-medium">{frame.category}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Resolution</span>
            <span className="text-right font-medium">
              {frame.canvasWidth}x{frame.canvasHeight}
            </span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">File Size</span>
            <span className="text-right font-medium">{frame.fileSize}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Date Created</span>
            <span className="text-right font-medium">
              {frame.dateCreated
                ? formatDateShort(frame.dateCreated)
                : '-'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Modified</span>
            <span className="text-right font-medium">
              {frame.lastModified
                ? formatDateShort(frame.lastModified)
                : '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
