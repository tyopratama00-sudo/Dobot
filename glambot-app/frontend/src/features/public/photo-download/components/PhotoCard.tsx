'use client';

import { Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { Photo } from '@/features/public/photo-editor/api/getPhotos';
import type { DownloadState } from '@/features/public/photo-download/hooks/useDownloadPhoto';

interface PhotoCardProps {
  photo: Photo;
  index: number;
  downloadState: DownloadState;
  onDownload: (photo: Photo) => void;
  /** Tailwind aspect class (default `aspect-3/4`). Use `aspect-[2/3]` for strips. */
  aspectClass?: string;
  /** Hide the "Foto N" label below the image. */
  hideLabel?: boolean;
}

export function PhotoCard({
  photo,
  index,
  downloadState,
  onDownload,
  aspectClass = 'aspect-3/4',
  hideLabel = false,
}: PhotoCardProps) {
  return (
    <div
      data-testid="photo-card"
      className="group relative flex flex-col gap-2"
    >
      {/* Image */}
      <div
        className={`relative w-full ${aspectClass} overflow-hidden rounded-2xl bg-black/20`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={`Photo ${index + 1}`}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />

        {/* Download overlay — always visible */}
        <div className="absolute inset-0 flex items-end justify-end p-3 rounded-2xl bg-linear-to-t from-black/50 via-transparent to-transparent">
          {downloadState === 'idle' && (
            <button
              onClick={() => onDownload(photo)}
              aria-label={`Download Photo ${index + 1}`}
              className="min-w-11 min-h-11 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Download className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {downloadState === 'downloading' && (
            <div
              role="status"
              aria-label="Downloading"
              className="min-w-11 min-h-11 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm border border-white/30"
            >
              <Loader2
                className="w-5 h-5 text-white animate-spin"
                aria-hidden="true"
              />
            </div>
          )}

          {downloadState === 'done' && (
            <div
              role="status"
              aria-label="Download complete"
              className="min-w-11 min-h-11 flex items-center justify-center rounded-full bg-green-500/30 backdrop-blur-sm border border-green-400/50"
            >
              <CheckCircle
                className="w-5 h-5 text-green-400"
                aria-hidden="true"
              />
            </div>
          )}

          {downloadState === 'error' && (
            <button
              onClick={() => onDownload(photo)}
              aria-label={`Failed to download Photo ${index + 1}, click to try again`}
              className="min-w-11 min-h-11 flex items-center justify-center rounded-full bg-red-500/20 backdrop-blur-sm border border-red-400/50 text-red-400 hover:bg-red-500/30 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
            >
              <AlertCircle className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Label */}
      {!hideLabel && (
        <p className="text-center text-sm font-medium text-white">
          Foto {index + 1}
        </p>
      )}
    </div>
  );
}
