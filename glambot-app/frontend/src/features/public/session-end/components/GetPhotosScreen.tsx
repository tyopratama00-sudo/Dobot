'use client';

import { Sparkles } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Lottie from 'lottie-react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import loadingAnimation from '@/assets/loading.json';
import Timer from '@/components/shared/Timer';
import { useDriveLink } from '@/features/public/photo-download/api/getDriveLink';
import { useLiveGifAvailability } from '@/features/public/photo-download/api/getGifAvailability';
import { GIFPreview } from '@/features/public/photo-download/components/GIFPreview';
import { useFramedPhotos } from '@/features/public/photo-editor/api/getPhotos';
import { useAppConfig } from '@/shared/api/config';
import { useGetSession } from '@/shared/api/session';
import { playBackendAudio, playBackendAudioAfterCurrent } from '@/lib/audio';
import { toAbsoluteUrl } from '@/lib/api-client';

// Timing tunggu preview strip (live GIF / framed) sebelum layar QR dibuka.
// Berjenjang: poll sumber → preload sumbernya → jaring pengaman terakhir.
const STRIP_POLL_MS = 1200; // interval cek framed strip / ketersediaan GIF
const STRIP_WAIT_MS = 15000; // berhenti menunggu sumber, lanjut apa adanya
const STRIP_PRELOAD_CAP_MS = 20000; // batas menunggu gambar/GIF selesai load
const STRIP_PRELOAD_RETRIES = 4; // percobaan preload sebelum menyerah
const STRIP_PRELOAD_RETRY_MS = 1500; // jeda antar percobaan preload
const STRIP_HARD_CAP_MS = 32000; // jaring pengaman paling luar

interface GetPhotosScreenProps {
  onComplete: () => void;
  sessionId: string;
}

export function GetPhotosScreen({
  onComplete,
  sessionId,
}: GetPhotosScreenProps) {
  const [downloadUrl, setDownloadUrl] = useState('');
  const { data: appConfig } = useAppConfig();

  // Splash minimum supaya loading tidak berkedip sekejap.
  const [minSplashDone, setMinSplashDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Narasi "sedang memproses foto" — main sekali saat layar ini muncul (fase
  // loading, sebelum QR siap). scanQr di bawah menyusul setelah ini.
  useEffect(() => {
    playBackendAudio('fotoProses.mp3');
  }, []);

  // Build the download URL after mount (window is undefined during SSR).
  // Override with NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL if the kiosk is accessed via
  // localhost — set this to the LAN IP/public URL the HP can reach.
  useEffect(() => {
    const base =
      process.env.NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL?.trim() ||
      window.location.origin;
    // Sengaja setState di effect: `window` tak tersedia saat SSR, jadi URL baru
    // bisa dihitung setelah mount. Melakukannya di initializer akan memicu
    // hydration mismatch (server '' vs client URL asli).
    setDownloadUrl(`${base}/download-photos/${sessionId}`);
  }, [sessionId]);

  // Link folder Google Drive (kalau fitur aktif). Saat aktif, QR diarahkan ke
  // folder Drive publik — bisa dibuka dari mana saja, tidak bergantung LAN.
  const { data: drive } = useDriveLink({ sessionId });
  const driveActive = drive?.enabled === true;
  const driveReady = drive?.ready === true;

  // Sesi Digital tidak lewat photo editor → tidak pernah punya strip framed,
  // jadi Live Strip GIF mustahil ada untuk mereka. Preview-nya diganti GIF
  // slideshow ("Live Photos") yang sudah ada — foto sesi diputar bergantian.
  const { data: session } = useGetSession({ sessionId });
  const isDigital = !!session && session.packageCode !== 'vip';

  // Strip preview: pakai hasil sesi yang sebenarnya, bukan gambar statis.
  // Prioritas: Live Strip GIF (animasi, paling menarik) → strip framed final →
  // GIF slideshow sebagai "Live Photos" (sesi Digital, atau kalau strip gagal).
  //
  // PENTING: layar ini dibuka TEPAT setelah compose, jadi saat mount backend
  // biasanya BELUM selesai menulis framed strip / menyiapkan live GIF. Kalau
  // kedua query cuma di-fetch sekali, keduanya balas "belum ada" → sumber
  // preview dianggap tidak ada → loading langsung selesai → QR tampil, lalu
  // beberapa detik kemudian GIF baru muncul & berputar loading di dalam kartu.
  // Karena itu keduanya di-POLL sampai sumbernya benar-benar ada (atau menyerah
  // setelah STRIP_WAIT_MS), baru preview di-preload dan halaman dibuka.
  const [stripReady, setStripReady] = useState(false);
  const [stripWaitExpired, setStripWaitExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStripWaitExpired(true), STRIP_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  const stopPolling = stripReady || stripWaitExpired;
  const { data: framedPhotos } = useFramedPhotos({
    sessionId,
    queryConfig: { refetchInterval: stopPolling ? false : STRIP_POLL_MS },
  });
  const { data: liveGifAvailability } = useLiveGifAvailability({
    sessionId,
    queryConfig: { refetchInterval: stopPolling ? false : STRIP_POLL_MS },
  });
  const framedStrip = framedPhotos?.[0];
  const isLiveStripAvailable = liveGifAvailability?.available ?? false;

  // Sumber preview sudah pasti — live GIF siap, framed strip sudah ada, sesi
  // Digital (sumbernya pasti GIF slideshow, tak perlu ditunggu), atau kita
  // sudah menunggu terlalu lama dan lanjut dengan apa adanya.
  const stripSourceResolved =
    isLiveStripAvailable || !!framedStrip || isDigital || stripWaitExpired;

  // Batas aman: kalau link Drive belum siap setelah 45 detik (mis. upload gagal
  // / sangat lambat), jangan biarkan loading menggantung — lanjut ke QR dengan
  // fallback URL download lokal. Start saat mount supaya juga mencakup periode
  // saat status Drive masih belum diketahui.
  const [driveTimedOut, setDriveTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDriveTimedOut(true), 45000);
    return () => clearTimeout(t);
  }, []);

  // Tahan di loading SELAMA link Drive belum siap (atau status belum diketahui),
  // supaya QR yang akhirnya muncul DIJAMIN sudah berisi URL Drive — scan QR
  // langsung membuka folder Drive, bukan QR kosong/menyusul.
  const driveMaybeActive = drive === undefined || drive.enabled === true;
  const waitingForDrive = driveMaybeActive && !driveReady && !driveTimedOut;

  // Pre-load preview strip (GIF live / framed) SEBELUM QR hasil tampil, supaya
  // saat halaman muncul preview sudah siap — bukan spinner di dalam kartu.
  // Untuk live GIF, request preload inilah yang memicu/menunggu generasi di
  // backend, jadi onload = GIF benar-benar siap dan sudah masuk cache browser
  // (URL-nya identik dengan yang dipakai GIFPreview, Cache-Control 60s).
  const stripPreloadRef = useRef(false);
  // Jaring pengaman lepas dari state query: kalau sumber/preload tak kunjung
  // selesai, jangan biarkan loading menggantung selamanya.
  useEffect(() => {
    const t = setTimeout(() => setStripReady(true), STRIP_HARD_CAP_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (stripPreloadRef.current) return;
    // Tunggu status ketersediaan diketahui dulu agar sumber yang dipilih benar
    // (live strip vs framed vs live photos). undefined = query belum selesai.
    if (liveGifAvailability === undefined || framedPhotos === undefined) return;
    // Masih mungkin berubah (backend belum selesai menulis strip / GIF) →
    // biarkan polling jalan dulu, jangan putuskan sumbernya sekarang.
    if (!stripSourceResolved) return;
    stripPreloadRef.current = true;

    let src: string;
    if (isLiveStripAvailable) {
      src = toAbsoluteUrl(`/api/photo/session/${sessionId}/gif-live?inline=1`);
    } else if (framedStrip?.url) {
      src = framedStrip.url;
    } else {
      // Tidak ada strip (sesi Digital) → "Live Photos" = GIF slideshow. Sesi
      // Digital tidak lewat compose, jadi GIF-nya belum pernah di-pre-generate;
      // request preload inilah yang memicu generasi di backend.
      src = toAbsoluteUrl(`/api/photo/session/${sessionId}/gif?inline=1`);
    }

    let done = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const finish = () => {
      if (!done) {
        done = true;
        setStripReady(true);
      }
    };

    // Error saat preload biasanya BUKAN gagal permanen: request pertama yang
    // memicu generate bisa balas 404/500 kalau backend belum selesai menulis
    // file. Coba ulang beberapa kali dulu — kalau langsung menyerah, layar QR
    // muncul dengan kartu preview "not available yet".
    const load = () => {
      const img = new Image();
      img.onload = finish;
      img.onerror = () => {
        if (done) return;
        attempt++;
        if (attempt >= STRIP_PRELOAD_RETRIES) {
          finish(); // menyerah — biar GIFPreview yang handle tampilan errornya
          return;
        }
        retryTimer = setTimeout(load, STRIP_PRELOAD_RETRY_MS);
      };
      img.src = src;
    };
    load();

    // Hard-cap: GIF live bisa perlu beberapa detik saat generate; setelah
    // batas ini tetap lanjut supaya loading tidak menggantung.
    const t = setTimeout(finish, STRIP_PRELOAD_CAP_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(retryTimer);
    };
  }, [
    stripSourceResolved,
    liveGifAvailability,
    framedPhotos,
    isLiveStripAvailable,
    framedStrip,
    sessionId,
  ]);

  // Nilai QR: link Drive kalau aktif & siap; kalau timeout tanpa siap atau Drive
  // tidak aktif, pakai URL halaman download lokal sebagai cadangan.
  const useDrive = driveActive && (driveReady || !driveTimedOut);
  const qrValue = useDrive ? (drive?.url ?? '') : downloadUrl;
  const isPreparing = useDrive && !driveReady;

  // Loading baru selesai kalau DUA-DUANYA siap: QR sudah punya nilai (bukan
  // placeholder kosong) DAN preview GIF/strip sudah selesai di-preload. Tanpa
  // syarat `qrValue`, layar hasil sempat muncul dengan kotak QR berdenyut
  // karena URL download lokal baru dihitung setelah mount.
  const isLoading =
    !minSplashDone || waitingForDrive || !qrValue || !stripReady;

  // Suara "scan QR untuk ambil foto" — main sekali saat loading selesai & QR
  // tampil (deklarasi sebelum early-return loading, patuh Rules of Hooks).
  const qrAudioFiredRef = useRef(false);
  useEffect(() => {
    if (!isLoading && !qrAudioFiredRef.current) {
      qrAudioFiredRef.current = true;
      // Tunggu "fotoProses" selesai dulu supaya tidak menabrak.
      playBackendAudioAfterCurrent('scanQr.mp3');
    }
  }, [isLoading]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-full w-full flex flex-col items-center justify-center gap-4">
        <div className="w-37.5 h-37.5">
          <Lottie animationData={loadingAnimation} loop={true} />
        </div>
        <p className="text-primary/60 text-lg font-medium tracking-wide animate-pulse">
          Processing your photos...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex flex-col items-center relative overflow-hidden">
      {appConfig && (
        <Timer
          duration={appConfig.getPhotosTimeoutSecs}
          onTimeUp={onComplete}
          storageKey={`get-photos:${sessionId}`}
        />
      )}
      {/* Header */}
      <div className="w-full flex items-center justify-center pt-10 pb-2 relative px-10">
        <div className="text-center">
          <h1 className="text-primary text-[60px] font-bold ">
            Get Your Photos
          </h1>
          <p className="text-primary text-2xl mt-2 leading-6.75">
            Scan the QR code below to download all your photos
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center gap-40 px-10 w-full max-w-5xl">
        {/* Left — Photo strip preview */}
        <div className="relative flex items-center justify-center">
          <Sparkles
            size={28}
            className="text-primary absolute -left-10 top-1/3"
            strokeWidth={1.5}
            fill="currentColor"
          />
          {/* Photo strip — hasil sesi nyata (live strip / framed), bukan statis.
              Sesi Digital tidak punya strip → tampilkan GIF slideshow foto
              sesi sebagai "Live Photos". */}
          <div className="w-90 -rotate-3 drop-shadow-xl">
            {isLiveStripAvailable ? (
              <GIFPreview
                endpoint={`/api/photo/session/${sessionId}/gif-live`}
                alt="Your live photo strip"
                aspectClass="aspect-[464/696]"
              />
            ) : framedStrip ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={framedStrip.url}
                alt="Your photo strip"
                className="w-full rounded-xl"
              />
            ) : (
              <GIFPreview
                endpoint={`/api/photo/session/${sessionId}/gif`}
                alt="Your live photos"
                aspectClass="aspect-[464/696]"
              />
            )}
          </div>
        </div>

        {/* Right — QR Code panel + dev link */}
        <div className="flex flex-col items-center gap-3">
          <div className="bg-primary/80 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-w-95 h-100">
            <h2 className="text-white text-xl font-bold">Scan to download</h2>
            <p className="text-white/60 text-xs text-center">
              {isPreparing
                ? 'Preparing Google Drive link...'
                : "Point your phone's camera at this QR code."}
            </p>
            <div className="rounded-xl p-3 bg-white">
              {qrValue ? (
                <QRCodeSVG
                  value={qrValue}
                  size={240}
                  level="M"
                  marginSize={2}
                  aria-label={`QR Code for ${qrValue}`}
                />
              ) : (
                <div className="w-60 h-60 bg-white/10 rounded animate-pulse" />
              )}
            </div>
          </div>

          {/* Link ke halaman download (alternatif kalau tidak scan QR). */}
          {/* <Link
            href={`/download-photos/${sessionId}`}
            className="text-primary underline text-sm font-medium hover:text-primary/70 transition-colors"
          >
            Open Download Page
          </Link> */}
        </div>
      </div>
    </div>
  );
}
