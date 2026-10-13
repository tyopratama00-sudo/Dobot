import { useCallback, useEffect, useRef, useState } from 'react';
import { playBackendAudioForce } from '@/lib/audio';
import { useRobotConfig } from '../api/getRobotConfig';

// Countdown shutter (3-2-1) → file audio. Semua sudah dipreload global
// (BACKEND_AUDIO_FILES) dan diputar lewat channel narasi bersama.
const COUNTDOWN_AUDIO: Record<number, string> = {
  3: 'tiga.mp3',
  2: 'dua.mp3',
  1: 'satu.mp3',
};

interface CameraPreviewProps {
  frameUrl?: string | null;
  streamUrl?: string | null;
  // Masih diterima dari parent untuk kompatibilitas; freeze kini pakai snapshot
  // canvas instan sehingga sessionId tidak lagi dipakai di komponen ini.
  sessionId?: string;
  onError?: () => void;
  onRetry?: () => void;
  hasError?: boolean;
  errorMessage?: string | null;
  className?: string;
}

export function CameraPreview({
  frameUrl,
  streamUrl,
  onError,
  onRetry,
  hasError = false,
  errorMessage,
  className,
}: CameraPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);
  const pendingRef = useRef(false);
  // Hitung kegagalan load frame berturut-turut. Baru anggap stream error setelah
  // ~2 detik gagal terus (bukan 1 frame transient) → hindari flicker error.
  const errorStreakRef = useRef(0);
  const playedRef = useRef<Set<number>>(new Set());
  const wasActiveRef = useRef(false);
  const captureTriggeredRef = useRef(false);
  const prevPresetRef = useRef(0);
  // Set false di cleanup. Callback timer freeze cek ref ini sebelum setState
  // supaya tidak fire di komponen yang sudah unmount.
  const isMountedRef = useRef(true);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureFired, setCaptureFired] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const capturedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayUrl = frameUrl || streamUrl;
  const hasContent = !!displayUrl;

  // Snapshot frame preview yang SEDANG tampil di canvas menjadi data URL.
  // Dipakai untuk overlay freeze secara INSTAN saat shutter — tidak menunggu
  // file full-res DSLR ditransfer dari backend (yang bisa 1-3 detik), jadi
  // tidak ada jeda. Foto full-res asli tetap disimpan backend & dipakai di
  // halaman editor. Canvas tidak tainted karena frame di-load
  // crossOrigin='anonymous' dan backend mengirim header CORS (middleware.CORS),
  // tapi tetap dijaga try/catch: kalau toDataURL gagal → fallback flash putih.
  const captureCanvasSnapshot = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/jpeg', 0.9);
    } catch (err) {
      console.warn(
        '[CameraPreview] snapshot freeze gagal (canvas tainted?):',
        err,
      );
      return null;
    }
  }, []);

  // Cleanup on unmount. Flag di-set true tiap mount — tanpa ini, remount (mis.
  // StrictMode dev) menyisakan flag false dari cleanup sebelumnya sehingga
  // callback timer freeze ikut mati.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (capturedTimerRef.current) clearTimeout(capturedTimerRef.current);
    };
  }, []);

  // Robot state — di-share via React Query hook (single underlying poll
  // dengan PhotoSessionPage). Effect di bawah ini react ke perubahan state,
  // detect transisi (active → inactive) untuk fire capture, dan preset
  // change untuk preset-confirmation sound.
  const { data: robotConfig } = useRobotConfig();
  const active = robotConfig?.auto_capture_active === true;
  const remainingMs = robotConfig?.auto_capture_remaining_ms ?? 0;
  const currentPreset = robotConfig?.current_preset ?? 0;

  useEffect(() => {
    // Robot just started moving to a new preset (transition 0 → N or N → M)
    if (currentPreset > 0 && currentPreset !== prevPresetRef.current) {
      // Force: rangkaian jepret foto lebih penting dari narasi prioritas
      // (peringatan waktu) — lihat playBackendAudioForce di lib/audio.
      playBackendAudioForce('presetOk.mp3');
    }
    prevPresetRef.current = currentPreset;
  }, [currentPreset]);

  useEffect(() => {
    if (active) {
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      if (seconds >= 1 && seconds <= 3) {
        // Countdown digerakkan oleh state robot real-time (poll React Query);
        // menyinkronkannya di effect memang disengaja, bukan state turunan.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCountdown(seconds);
        if (!playedRef.current.has(seconds)) {
          playedRef.current.add(seconds);
          // Lewat channel narasi bersama (bukan Audio terpisah) supaya countdown
          // ikut aturan "satu suara": tiap angka menghentikan yang sebelumnya
          // dan menghentikan voice FSM yang mungkin masih menyisa. Force supaya
          // aba-aba jepret tetap terdengar walau ada narasi prioritas berbunyi.
          playBackendAudioForce(COUNTDOWN_AUDIO[seconds]);
        }
      }
      wasActiveRef.current = true;
      captureTriggeredRef.current = false;
      return;
    }

    // active === false
    setCountdown(null);

    if (wasActiveRef.current && !captureTriggeredRef.current) {
      // Transition active → inactive = countdown just finished.
      captureTriggeredRef.current = true;
      // Freeze INSTAN: snapshot frame preview terakhir (bukan file full-res),
      // jadi tidak ada jeda saat shutter. Kalau snapshot gagal (null) overlay
      // memakai flash putih sebagai fallback. Foto full-res asli tetap ditangani
      // backend & dipakai di halaman editor — freeze ini murni visual sesaat.
      const snapshot = captureCanvasSnapshot();
      setCaptureFired(true);
      setCapturedUrl(snapshot);
      if (capturedTimerRef.current) clearTimeout(capturedTimerRef.current);
      capturedTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setCaptureFired(false);
          setCapturedUrl(null);
        }
      }, 3000);
    }

    wasActiveRef.current = false;
    playedRef.current.clear();
  }, [active, remainingMs, captureCanvasSnapshot]);

  // Canon mode: polling JPEG frames (backend already returns mirrored)
  useEffect(() => {
    if (!displayUrl || hasError) {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      return;
    }
    // Reset hitungan error tiap kali stream (re-)start, mis. setelah retry.
    errorStreakRef.current = 0;
    // Ikut dilepas: kalau ada frame yang masih menggantung saat effect lama
    // dibersihkan, flag-nya bertahan `true` dan loop baru tak pernah menembak
    // request pertama — "Try again" jadi tidak berefek.
    pendingRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1280;
    canvas.height = 720;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const loadFrame = () => {
      if (pendingRef.current) return;
      pendingRef.current = true;

      const baseUrl = displayUrl.split('?')[0];
      const url = `${baseUrl}?t=${Date.now()}_${++frameCountRef.current}`;

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        pendingRef.current = false;
        errorStreakRef.current = 0;
      };

      img.onerror = () => {
        pendingRef.current = false;
        errorStreakRef.current += 1;
        // ~20 frame gagal beruntun (interval 100ms ≈ 2 detik) → laporkan ke
        // parent supaya UI "Stream not available" + tombol retry muncul.
        if (errorStreakRef.current === 20) {
          onError?.();
        }
      };

      img.src = url;
    };

    loadFrame();
    frameIntervalRef.current = setInterval(loadFrame, 100);

    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [displayUrl, hasError, onError]);

  const showError = hasError || !displayUrl;

  return (
    <div
      className={`relative h-full w-full rounded-[28px] overflow-hidden bg-black ${className ?? ''}`}
    >
      {/* Soft inner highlight for depth */}
      <div className="pointer-events-none absolute inset-0 z-10 rounded-[22px] ring-1 ring-inset ring-white/10" />
      {showError || !hasContent ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <p className="text-white/40 text-sm">
            {errorMessage ?? 'Stream not available'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-primary/60 underline hover:text-primary"
            >
              Try again
            </button>
          )}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          // Mirror preview (selfie-familiar) via CSS, bukan lagi flip JPEG di
          // backend per frame — hemat decode+re-encode tiap frame di server.
          // Hasil foto Canon tetap natural (tidak di-mirror), sama seperti dulu.
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          style={{ display: 'block' }}
        />
      )}

      {/* Countdown overlay (3, 2, 1) — centered, large, white */}
      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <span
            key={countdown}
            className="text-white font-bold animate-[countdownPop_900ms_ease-out_forwards]"
            style={{
              fontSize: 'min(45vw, 320px)',
              lineHeight: 1,
              textShadow:
                '0 0 30px rgba(0,0,0,0.7), 0 0 80px rgba(0,0,0,0.5), 0 6px 32px rgba(0,0,0,0.6)',
            }}
          >
            {countdown}
          </span>
        </div>
      )}

      {/* Capture freeze overlay — muncul langsung saat capture fired (3 detik).
          Jika foto sudah di-fetch dari backend, tampilkan foto asli.
          Jika belum, tampilkan flash putih sebagai placeholder. */}
      {captureFired && (
        <div className="fixed inset-0 z-50 overflow-hidden animate-[fadeIn_150ms_ease-out]">
          {capturedUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturedUrl}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-50"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturedUrl}
                alt=""
                // Snapshot canvas = frame mentah (belum di-mirror). Preview
                // tampil di-mirror via CSS, jadi freeze ikut di-mirror supaya
                // konsisten dengan yang barusan dilihat user (selfie-familiar).
                className="relative w-screen h-screen object-contain drop-shadow-2xl -scale-x-100"
              />
            </>
          ) : (
            <div className="w-full h-full bg-white animate-[flashFade_400ms_ease-out_forwards]" />
          )}
        </div>
      )}

      {/* Corner brackets — refined: smaller, softer, brand-tinted */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t border-l border-white/40 rounded-tl-md pointer-events-none z-10" />
      <div className="absolute top-4 right-4 w-6 h-6 border-t border-r border-white/40 rounded-tr-md pointer-events-none z-10" />
      <div className="absolute bottom-4 left-4 w-6 h-6 border-b border-l border-white/40 rounded-bl-md pointer-events-none z-10" />
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b border-r border-white/40 rounded-br-md pointer-events-none z-10" />
    </div>
  );
}
