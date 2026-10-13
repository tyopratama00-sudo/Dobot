import type { Photo } from '@/features/public/photo-editor/api/getPhotos';
import type { DownloadState } from '@/features/public/photo-download/hooks/useDownloadPhoto';
import { PhotoCard } from './PhotoCard';

interface PhotoGridProps {
  photos: Photo[];
  onDownload: (photo: Photo) => void;
  downloadStates: Record<string, DownloadState>;
}

export function PhotoGrid({
  photos,
  onDownload,
  downloadStates,
}: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          index={index}
          downloadState={downloadStates[photo.id] ?? 'idle'}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}
