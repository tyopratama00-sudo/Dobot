'use client';

import { useMemo, useState } from 'react';
import { toAbsoluteUrl } from '@/lib/api-client';

interface GIFPreviewProps {
  // Path API tanpa query string, mis. `/api/photo/session/{id}/gif`
  endpoint: string;
  // Aspect ratio CSS untuk container preview. Default "aspect-[2/3]"
  // (cocok untuk live strip & slideshow yang sumbernya foto portrait).
  aspectClass?: string;
  alt: string;
}

// GIFPreview menampilkan inline preview dari endpoint GIF backend.
// Endpoint backend mendukung ?inline=1 yang men-set Content-Disposition
// inline supaya browser render sebagai <img> alih-alih force download.
//
// Backend pre-generate GIF di goroutine setelah compose; kalau halaman
// di-buka terlalu cepat (sebelum pre-gen selesai) request pertama akan
// generate sync — bisa makan beberapa detik. Komponen ini handle skeleton
// loading + error fallback.
export function GIFPreview({
  endpoint,
  aspectClass = 'aspect-[2/3]',
  alt,
}: GIFPreviewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  // URL STABIL (tanpa cache-bust per-mount). GIF satu sesi bersifat immutable
  // (URL sudah mengandung sessionId yang unik), jadi tidak perlu di-bust. URL
  // yang stabil PENTING supaya preload di GetPhotosScreen memakai URL yang SAMA
  // dengan yang dirender di sini → browser menyajikan dari cache secara instan
  // (bukan download ulang + spinner lagi). Backend juga sudah pre-generate GIF
  // saat compose, sehingga request pertama umumnya langsung hit cache file.
  const src = useMemo(
    () => toAbsoluteUrl(`${endpoint}?inline=1`),
    [endpoint],
  );

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-black/30 border border-white/10 ${aspectClass}`}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            role="status"
            aria-label="Loading GIF"
            className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin"
          />
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center">
          <p className="text-white/70 text-xs font-medium">
            Preview not available yet
          </p>
          <p className="text-white/40 text-[10px]">
            Try refreshing the page in a few seconds.
          </p>
        </div>
      )}

      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- foto/GIF dari host LAN backend; <img> disengaja agar tak perlu allowlist host next/image (lihat next.config)
        <img
          src={src}
          alt={alt}
          // GIF sudah pre-generate backend saat compose (lihat ComposeFrame),
          // jadi mulai fetch SEGERA saat mount — bukan `lazy` yang menunda
          // sampai mendekati viewport. `decoding=async` + prioritas tinggi
          // supaya preview muncul secepat mungkin begitu file diterima.
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            status === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  );
}
