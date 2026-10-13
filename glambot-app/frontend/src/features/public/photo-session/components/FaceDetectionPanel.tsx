import { ScanFace, Camera, Move } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { RobotFsmState, RobotSequence } from '../api/getRobotDetection';

interface FaceDetectionPanelProps {
  /** URL stream MJPEG dobot (/video_feed). Null = tidak aktif. */
  streamUrl: string | null;
  /** Robot service terjangkau (poll /detection sukses)? */
  reachable?: boolean;
  fsmState?: RobotFsmState;
  /** Wajah sedang terdeteksi di frame kamera robot. */
  faceDetected?: boolean;
  /** FaceTracker sedang mengoreksi j5/j6. */
  trackingActive?: boolean;
  sequence?: RobotSequence | null;
  /** Class tambahan untuk kontainer luar (mis. override border/frame). */
  className?: string;
}

export function FaceDetectionPanel({
  streamUrl,
  reachable = false,
  fsmState = 'IDLE',
  faceDetected = false,
  trackingActive = false,
  sequence,
  className,
}: FaceDetectionPanelProps) {
  // Bump nonce saat stream error → paksa <img> MJPEG reconnect. streamUrl ikut
  // masuk ke key <img> supaya ganti stream otomatis remount (tanpa reset effect).
  const [nonce, setNonce] = useState(0);

  const isMoving = fsmState === 'MOVING';
  const isCapturing = fsmState === 'CAPTURING';
  const hasStream = !!streamUrl && reachable;

  const index = sequence?.index ?? 0;
  const total = sequence?.total ?? 0;
  const secondsLeft = sequence?.seconds_left ?? 0;

  const statusLabel =
    fsmState === 'DONE'
      ? 'Selesai'
      : index > 0
        ? `Pose ${index} / ${total}`
        : 'Bersiap';

  // Indikator kanan: selama countdown yang penting "jangan gerak", di luar itu
  // tunjukkan apakah wajah sudah terkunci dan tracking bekerja.
  const hint = isCapturing
    ? 'Jangan bergerak!'
    : isMoving
      ? 'Kamera bergerak…'
      : faceDetected
        ? trackingActive
          ? `Wajah terkunci · ${Math.ceil(secondsLeft)}s`
          : 'Wajah terdeteksi'
        : 'Mencari wajah…';

  const hintOk = faceDetected || isCapturing;

  return (
    <div
      className={cn(
        'relative bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-lg h-full',
        className,
      )}
    >
      {/* Video mengisi SELURUH card — status & hint di-overlay di atasnya
          (bukan bar terpisah) supaya tidak ada blok solid yang terpisah dari
          video. */}
      {hasStream ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${streamUrl}-${nonce}`}
          src={`${streamUrl}?k=${nonce}`}
          alt="Robot face-detection camera"
          className="absolute inset-0 w-full h-full object-cover bg-black"
          onError={() => {
            window.setTimeout(() => setNonce((n) => n + 1), 1500);
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/30 text-xs">
            {reachable ? 'Stream not available' : 'Robot camera offline'}
          </p>
        </div>
      )}

      {/* Overlay saat kamera berpindah pose — preview deteksi tidak berguna
          selama lengan bergerak. */}
      {isMoving && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="flex items-center gap-3 text-white text-lg font-medium tracking-wide">
            <Move size={22} className="animate-pulse" />
            Moving to next pose…
          </span>
        </div>
      )}

      {/* Overlay bawah: scrim gradient gelap + nomor pose (kiri) & status wajah
          (kanan). */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-7 pt-20 pb-6">
        <div className="flex items-center gap-3.5">
          {isCapturing ? (
            <Camera size={38} className="text-[#e8b98f] animate-pulse" strokeWidth={2.5} />
          ) : (
            <ScanFace size={38} className="text-white" strokeWidth={2.5} />
          )}
          <span
            className={cn(
              'text-5xl font-bold tracking-wide',
              isCapturing ? 'text-[#e8b98f]' : 'text-white',
            )}
          >
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-3.5 h-3.5 rounded-full',
              hintOk ? 'bg-[#00d084] animate-pulse' : 'bg-[#e8b98f]',
            )}
          />
          <span className="text-3xl font-semibold text-white">{hint}</span>
        </div>
      </div>
    </div>
  );
}
