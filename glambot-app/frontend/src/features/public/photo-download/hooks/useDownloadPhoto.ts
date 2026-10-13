import { useState, useCallback } from 'react';
import type { Photo } from '@/features/public/photo-editor/api/getPhotos';
import { toAbsoluteUrl } from '@/lib/api-client';

export type DownloadState = 'idle' | 'downloading' | 'done' | 'error';

export interface UseDownloadPhotoReturn {
  downloadStates: Record<string, DownloadState>;
  gifState: DownloadState;
  gifLiveState: DownloadState;
  downloadPhoto: (photo: Photo) => Promise<void>;
  downloadAll: (photos: Photo[]) => Promise<void>;
  downloadGIF: (sessionId: string) => Promise<void>;
  downloadLiveGIF: (sessionId: string) => Promise<void>;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useDownloadPhoto(): UseDownloadPhotoReturn {
  const [downloadStates, setDownloadStates] = useState<
    Record<string, DownloadState>
  >({});
  const [gifState, setGifState] = useState<DownloadState>('idle');
  const [gifLiveState, setGifLiveState] = useState<DownloadState>('idle');

  const setPhotoState = useCallback((photoId: string, state: DownloadState) => {
    setDownloadStates((prev) => ({ ...prev, [photoId]: state }));
  }, []);

  const triggerBrowserDownload = useCallback(
    async (url: string, filename: string) => {
      // Fetch as blob so the browser always downloads instead of navigating
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${url}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Release the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    },
    [],
  );

  const downloadPhoto = useCallback(
    async (photo: Photo): Promise<void> => {
      setPhotoState(photo.id, 'downloading');

      try {
        const filename = `photo-${photo.id}.jpg`;
        await triggerBrowserDownload(photo.url, filename);

        setPhotoState(photo.id, 'done');

        // Auto-reset 'done' → 'idle' after 2 seconds
        setTimeout(() => {
          setPhotoState(photo.id, 'idle');
        }, 2000);
      } catch {
        setPhotoState(photo.id, 'error');
      }
    },
    [setPhotoState, triggerBrowserDownload],
  );

  const downloadAll = useCallback(
    async (photos: Photo[]): Promise<void> => {
      for (let i = 0; i < photos.length; i++) {
        await downloadPhoto(photos[i]);

        // 300ms delay between downloads (skip delay after last photo)
        if (i < photos.length - 1) {
          await delay(300);
        }
      }
    },
    [downloadPhoto],
  );

  const downloadGIF = useCallback(
    async (sessionId: string): Promise<void> => {
      if (!sessionId) return;
      setGifState('downloading');
      try {
        const url = toAbsoluteUrl(`/api/photo/session/${sessionId}/gif`);
        const filename = `photobooth-${sessionId}.gif`;
        await triggerBrowserDownload(url, filename);
        setGifState('done');
        setTimeout(() => setGifState('idle'), 2000);
      } catch (err) {
        console.error('[useDownloadPhoto] GIF download failed:', err);
        setGifState('error');
        setTimeout(() => setGifState('idle'), 3000);
      }
    },
    [triggerBrowserDownload],
  );

  const downloadLiveGIF = useCallback(
    async (sessionId: string): Promise<void> => {
      if (!sessionId) return;
      setGifLiveState('downloading');
      try {
        const url = toAbsoluteUrl(`/api/photo/session/${sessionId}/gif-live`);
        const filename = `photobooth-live-${sessionId}.gif`;
        await triggerBrowserDownload(url, filename);
        setGifLiveState('done');
        setTimeout(() => setGifLiveState('idle'), 2000);
      } catch (err) {
        console.error('[useDownloadPhoto] Live GIF download failed:', err);
        setGifLiveState('error');
        setTimeout(() => setGifLiveState('idle'), 3000);
      }
    },
    [triggerBrowserDownload],
  );

  return {
    downloadStates,
    gifState,
    gifLiveState,
    downloadPhoto,
    downloadAll,
    downloadGIF,
    downloadLiveGIF,
  };
}
