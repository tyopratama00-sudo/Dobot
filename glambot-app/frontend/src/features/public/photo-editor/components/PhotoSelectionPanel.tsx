'use client';

import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import GlassCard from '@/components/shared/GlassCard';
import type { Photo } from '../api/getPhotos';

// Left panel displaying scrollable grid of session photos. Touchscreen: foto
// bisa DI-DRAG langsung ke slot pada preview (gesture utama), atau di-TAP untuk
// "arm" lalu tap slot (fallback). Kedua-duanya dilayani oleh useDragToPlace:
// drag = tempatkan, tap-tanpa-geser = arm. Lihat PhotoEditorPage.
interface DragBinding {
  onPointerDown: (e: ReactPointerEvent) => void;
  style: CSSProperties;
}

interface PhotoSelectionPanelProps {
  photos: Photo[];
  isLoading: boolean;
  armedPhotoId: string | null;
  /** Props drag (dari useDragToPlace) untuk di-spread ke thumbnail. */
  getDragProps: (photo: { id: string; url: string }) => DragBinding;
  /** Foto yang sedang di-drag → thumbnail sumbernya diredupkan. */
  draggingPhotoId?: string | null;
}

interface PhotoItemProps {
  photo: Photo;
  isArmed: boolean;
  isDragging: boolean;
  drag: DragBinding;
}

function PhotoItem({ photo, isArmed, isDragging, drag }: PhotoItemProps) {
  return (
    <button
      type="button"
      data-testid={`photo-thumbnail-${photo.id}`}
      onPointerDown={drag.onPointerDown}
      style={drag.style}
      aria-pressed={isArmed}
      className={`relative aspect-square w-full rounded-xl overflow-hidden transition-all duration-150 shadow-md select-none ${
        isDragging
          ? 'opacity-40 ring-2 ring-[#3F72AF]/50'
          : isArmed
            ? 'ring-4 ring-[#3F72AF] scale-[1.03] shadow-lg'
            : 'ring-0 active:scale-95'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.thumbnailUrl ?? photo.url}
        alt={`Photo ${photo.id}`}
        draggable={false}
        className="w-full h-full object-cover pointer-events-none select-none"
      />
      {/* Badge saat foto sedang dipilih untuk ditempatkan. */}
      {isArmed && !isDragging && (
        <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-7 h-7 rounded-full bg-[#3F72AF] text-white shadow-md">
          <Check size={16} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export default function PhotoSelectionPanel({
  photos,
  isLoading,
  armedPhotoId,
  getDragProps,
  draggingPhotoId,
}: PhotoSelectionPanelProps) {
  if (isLoading) {
    return (
      <GlassCard className="flex flex-col h-full max-w-none shadow-none">
        <div className="flex items-center justify-center h-full">
          <StatusAnimation status="waiting" className="w-16 h-16" />
        </div>
      </GlassCard>
    );
  }

  if (photos.length === 0) {
    return (
      <GlassCard className="flex flex-col h-full max-w-none">
        <div className="flex flex-col items-center justify-center h-full gap-3 px-4 py-8 text-center">
          <p className="text-[#F9F7F7]/60 text-sm font-medium">
            No photos available.
          </p>
          <p className="text-[#F9F7F7]/35 text-xs leading-relaxed">
            Complete a photo session first.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="flex flex-col shadow-none h-full max-w-none rounded-[19.28px]">
      <div className="flex-1 overflow-y-auto min-h-0 p-3 scrollbar-none">
        <p className="text-[#ffff]/40 text-[13px] pl-3">
          {armedPhotoId ? 'TAP A SLOT TO PLACE' : 'DRAG OR TAP A PHOTO'}
        </p>
        <div data-testid="photo-gallery" className="grid grid-cols-2 gap-2 p-2">
          {photos.map((photo) => (
            <PhotoItem
              key={photo.id}
              photo={photo}
              isArmed={armedPhotoId === photo.id}
              isDragging={draggingPhotoId === photo.id}
              drag={getDragProps({ id: photo.id, url: photo.url })}
            />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
