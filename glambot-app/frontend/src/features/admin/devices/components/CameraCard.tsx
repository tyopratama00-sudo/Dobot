'use client';

import * as React from 'react';
import { CameraIcon, WifiIcon, WifiOffIcon } from 'lucide-react';
import { InfoRow } from '@/components/admin/shared/InfoRow';

interface CameraInfo {
  id: string;
  resolution: string;
  status: string;
  lastActive: string;
  activeDuration: string;
  isOnline: boolean;
  imageSrc?: string;
}

interface CameraCardProps {
  data: CameraInfo;
}

export function CameraCard({ data }: CameraCardProps) {
  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CameraIcon className="size-5 text-blue-500" />
          <span className="text-base font-semibold">Camera</span>
        </div>
        <span
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            data.isOnline
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-rose-100 text-rose-700'
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              data.isOnline ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          {data.isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Connection status */}
      <div
        className={`flex items-center gap-3 rounded-lg border p-3 ${
          data.isOnline
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-rose-200 bg-rose-50'
        }`}
      >
        <div
          className={`flex size-9 items-center justify-center rounded-lg ${
            data.isOnline ? 'bg-emerald-100' : 'bg-rose-100'
          }`}
        >
          {data.isOnline ? (
            <WifiIcon className="size-5 text-emerald-600" />
          ) : (
            <WifiOffIcon className="size-5 text-rose-600" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Connection Status</span>
          <span
            className={`text-xs ${
              data.isOnline ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {data.isOnline ? 'Connected' : 'Not connected'}
          </span>
        </div>
      </div>

      {/* Information */}
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-base font-semibold">Information</div>
        <InfoRow label="ID Camera" value={data.id} />
        {/* Resolution sengaja tidak ditampilkan: backend belum bisa membacanya
            dari device (selalu N/A). */}
        <InfoRow label="Status" value={data.status} />
        <InfoRow label="Last Active" value={data.lastActive} />
        <InfoRow label="Active Duration" value={data.activeDuration} last />
      </div>
    </div>
  );
}

export type { CameraInfo };
