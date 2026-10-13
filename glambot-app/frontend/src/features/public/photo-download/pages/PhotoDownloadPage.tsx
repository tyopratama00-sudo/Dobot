'use client';

import {
  usePhotos,
  useFramedPhotos,
} from '@/features/public/photo-editor/api/getPhotos';
import { useDownloadPhoto } from '@/features/public/photo-download/hooks/useDownloadPhoto';
import { useLiveGifAvailability } from '@/features/public/photo-download/api/getGifAvailability';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/features/public/photo-download/components/ErrorState';
import { PhotoGrid } from '@/features/public/photo-download/components/PhotoGrid';
import { PhotoCard } from '@/features/public/photo-download/components/PhotoCard';
import { GIFPreview } from '@/features/public/photo-download/components/GIFPreview';
import GlassCard from '@/components/shared/GlassCard';

interface PhotoDownloadPageProps {
  sessionId: string;
}

export function PhotoDownloadPage({ sessionId }: PhotoDownloadPageProps) {
  const {
    data: rawPhotos,
    isLoading: isLoadingRaw,
    isError: isErrorRaw,
    refetch: refetchRaw,
  } = usePhotos({ sessionId });

  const {
    data: framedPhotos,
    isLoading: isLoadingFramed,
    isError: isErrorFramed,
    refetch: refetchFramed,
  } = useFramedPhotos({ sessionId });

  const {
    downloadStates,
    gifState,
    gifLiveState,
    downloadPhoto,
    downloadAll,
    downloadGIF,
    downloadLiveGIF,
  } = useDownloadPhoto();

  const { data: liveGifAvailability } = useLiveGifAvailability({ sessionId });
  const isLiveGifAvailable = liveGifAvailability?.available ?? false;

  if (!sessionId) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <GlassCard
          variant="default"
          className="flex flex-col items-center text-center px-6 py-8 gap-4 max-w-sm"
        >
          <p className="text-white font-semibold text-base">
            Invalid session ID.
          </p>
        </GlassCard>
      </main>
    );
  }

  const isLoading = isLoadingRaw || isLoadingFramed;
  const isError = isErrorRaw && isErrorFramed;

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4 gap-4">
        <div
          role="status"
          aria-label="Loading photos"
          className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin"
        />
        <p className="text-primary font-semibold text-base">Loading photos...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <ErrorState
          onRetry={() => {
            refetchRaw();
            refetchFramed();
          }}
        />
      </main>
    );
  }

  const raw = rawPhotos ?? [];
  const framed = framedPhotos ?? [];
  const allPhotos = [...framed, ...raw];

  if (allPhotos.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <GlassCard
          variant="default"
          className="flex flex-col items-center text-center px-6 py-8 gap-4 max-w-sm"
        >
          <p className="text-white font-semibold text-base">
            No photos found for this session.
          </p>
        </GlassCard>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-full px-3 sm:px-4 py-4 sm:py-8 gap-4 sm:gap-6 pb-24">
      {/* Header */}
      <header className="w-full max-w-2xl text-center flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary leading-tight">
          Download Your Photos
        </h1>
        <p className="text-primary/60 text-xs sm:text-sm">
          {framed.length > 0 && `${framed.length} strip results · `}
          {raw.length} raw photos
        </p>
      </header>

      {/* Framed result (hero section) */}
      {framed.length > 0 && (
        <section className="w-full max-w-2xl flex flex-col gap-2 sm:gap-3">
          <h2 className="text-primary/80 text-xs sm:text-sm font-semibold uppercase tracking-wider px-1">
            Strip Results
          </h2>
          <GlassCard
            variant="default"
            maxWidth="max-w-2xl"
            className="flex flex-col items-center gap-4 p-3 sm:p-4"
          >
            <div className="flex flex-col items-center gap-4 w-full">
              {framed.map((photo, index) => (
                <div
                  key={photo.id}
                  className="w-full max-w-[260px] sm:max-w-xs"
                >
                  <PhotoCard
                    photo={photo}
                    index={index}
                    downloadState={downloadStates[photo.id] ?? 'idle'}
                    onDownload={downloadPhoto}
                    aspectClass="aspect-[464/696]"
                    hideLabel
                  />
                </div>
              ))}
            </div>
          </GlassCard>
        </section>
      )}

      {/* Animated GIF — dua varian: slideshow foto + live strip (kalau ada
          burst frames). Tampil kalau ada minimal foto. */}
      {allPhotos.length > 0 && (
        <section className="w-full max-w-2xl flex flex-col gap-2 sm:gap-3">
          <h2 className="text-primary/80 text-xs sm:text-sm font-semibold uppercase tracking-wider px-1">
            Animated GIF
          </h2>

          {/* GIF #1: Slideshow foto raw terpilih */}
          <GlassCard
            variant="default"
            maxWidth="max-w-2xl"
            className="flex flex-col sm:flex-row sm:items-stretch gap-3 sm:gap-4 p-4"
          >
            <div className="w-full sm:w-32 shrink-0">
              <GIFPreview
                endpoint={`/api/photo/session/${sessionId}/gif`}
                alt="Preview slideshow GIF"
                aspectClass="aspect-[2/3]"
              />
            </div>
            <div className="flex-1 flex flex-col gap-3 justify-between">
              <div className="flex flex-col gap-1 text-center sm:text-left">
                {/* Sesi Digital tidak punya strip (jadi tidak ada Live Strip);
                    GIF yang sama ini yang jadi "Live Photos" mereka. */}
                <p className="text-white font-semibold text-sm sm:text-base">
                  {framed.length > 0 ? 'Photo Slideshow' : 'Live Photos'}
                </p>
                <p className="text-white/60 text-xs sm:text-sm">
                  {framed.length > 0
                    ? 'Selected photos looped one by one — perfect for your story / WhatsApp status.'
                    : 'All your photos looped one by one — perfect for your story / WhatsApp status.'}
                </p>
              </div>
              <Button
                variant="default"
                size="default"
                disabled={gifState === 'downloading'}
                onClick={() => downloadGIF(sessionId)}
                aria-label="Download slideshow GIF"
                className="w-full sm:w-auto sm:self-start whitespace-nowrap"
              >
                {gifState === 'downloading'
                  ? 'Preparing...'
                  : gifState === 'done'
                    ? 'Saved ✓'
                    : gifState === 'error'
                      ? 'Failed, try again'
                      : framed.length > 0
                        ? 'Download GIF'
                        : 'Download Live Photos'}
              </Button>
            </div>
          </GlassCard>

          {/* GIF #2: Live strip — strip frame dengan slot yang "hidup" pakai
              burst liveview frames sebelum settle ke foto final.
              Hanya tampil kalau backend punya burst frames (liveview Canon
              sempat capture). Kalau tidak ada burst → card di-hide supaya
              user tidak lihat tombol gagal. */}
          {framed.length > 0 && isLiveGifAvailable && (
            <GlassCard
              variant="default"
              maxWidth="max-w-2xl"
              className="flex flex-col sm:flex-row sm:items-stretch gap-3 sm:gap-4 p-4"
            >
              <div className="w-full sm:w-32 shrink-0">
                <GIFPreview
                  endpoint={`/api/photo/session/${sessionId}/gif-live`}
                  alt="Preview live strip GIF"
                  aspectClass="aspect-[2/3]"
                />
              </div>
              <div className="flex-1 flex flex-col gap-3 justify-between">
                <div className="flex flex-col gap-1 text-center sm:text-left">
                  <p className="text-white font-semibold text-sm sm:text-base">
                    Live Strip
                  </p>
                  <p className="text-white/60 text-xs sm:text-sm">
                    Your strip with each slot in motion (the 3 seconds before
                    the shot), then settling into the final photo.
                  </p>
                </div>
                <Button
                  variant="default"
                  size="default"
                  disabled={gifLiveState === 'downloading'}
                  onClick={() => downloadLiveGIF(sessionId)}
                  aria-label="Download live strip GIF"
                  className="w-full sm:w-auto sm:self-start whitespace-nowrap"
                >
                  {gifLiveState === 'downloading'
                    ? 'Preparing...'
                    : gifLiveState === 'done'
                      ? 'Saved ✓'
                      : gifLiveState === 'error'
                        ? 'Not available yet'
                        : 'Download Live Strip'}
                </Button>
              </div>
            </GlassCard>
          )}
        </section>
      )}

      {/* Raw photos */}
      {raw.length > 0 && (
        <section className="w-full max-w-2xl flex flex-col gap-2 sm:gap-3">
          <h2 className="text-primary/80 text-xs sm:text-sm font-semibold uppercase tracking-wider px-1">
            Raw Photos
          </h2>
          <GlassCard
            variant="default"
            maxWidth="max-w-2xl"
            className="flex flex-col gap-4 p-3 sm:p-4"
          >
            <PhotoGrid
              photos={raw}
              onDownload={downloadPhoto}
              downloadStates={downloadStates}
            />
          </GlassCard>
        </section>
      )}

      {/* Download all button — sticky at bottom on mobile for easy reach */}
      <div className="w-full max-w-2xl sticky bottom-3 px-1 z-10">
        <Button
          variant="default"
          size="default"
          className="w-full shadow-2xl"
          onClick={() => downloadAll(allPhotos)}
          aria-label="Download all photos"
        >
          Download All ({allPhotos.length})
        </Button>
      </div>
    </main>
  );
}
