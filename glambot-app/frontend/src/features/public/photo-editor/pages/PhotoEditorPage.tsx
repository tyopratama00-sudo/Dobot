'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fabric } from 'fabric';
import { HelpCircle } from 'lucide-react';

import { StatusAnimation } from '@/components/shared/StatusAnimation';
import Timer from '@/components/shared/Timer';
import PhotoSelectionPanel from '../components/PhotoSelectionPanel';
import PreviewArea, { type PreviewAreaHandle } from '../components/PreviewArea';
import FrameSelectionPanel from '../components/FrameSelectionPanel';
import ConfirmPrintButton from '../components/ConfirmPrintButton';
import SlotAdjustToolbar from '../components/SlotAdjustToolbar';
import PhotoEditorOnboarding from '../components/PhotoEditorOnboarding';
import {
  zoomPhoto,
  rotatePhoto,
  resetPhoto,
  collectSlotTransforms,
} from '../lib/slotTransform';
import { useDragToPlace, DragGhost } from '../hooks/useDragToPlace';

import { usePhotos } from '../api/getPhotos';
import { useFrames } from '../api/getFrames';
import type { Frame } from '../api/getFrames';
import { exportComposition } from '../lib/exportComposition';
import { useSaveComposition } from '../api/saveComposition';
import { printComposition } from '../api/printComposition';
import { usePhotoComposition } from '../hooks/usePhotoComposition';
import type { FilterType } from '../lib/filters';
import { useAppConfig } from '@/shared/api/config';
import { playBackendAudio } from '@/lib/audio';

// FilterType didefinisikan kanonik di lib/filters; di-re-export di sini supaya
// import lama `from '../pages/PhotoEditorPage'` tetap berfungsi tanpa drift.
export type { FilterType };

type TabType = 'frame' | 'filter';

export default function PhotoEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  // State
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(true);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('original');
  const [activeTab, setActiveTab] = useState<TabType>('frame');
  // Foto yang dipilih di panel kiri untuk ditempatkan (touchscreen tap-to-place,
  // menggantikan drag & drop). null = belum ada yang dipilih.
  const [armedPhoto, setArmedPhoto] = useState<{
    photoId: string;
    photoUrl: string;
  } | null>(null);
  // Slot foto yang sedang dipilih di canvas (dilaporkan PreviewArea) → toolbar
  // adjust dirender di baris bawah, sejajar Confirm Print (tidak menutupi preview).
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);
  // Ref imperatif ke PreviewArea untuk menempatkan foto hasil drag & drop.
  const previewRef = useRef<PreviewAreaHandle | null>(null);
  // True saat 15 detik terakhir → semburat merah + narasi "waktu hampir habis".
  const [timeUrgent, setTimeUrgent] = useState(false);
  const urgentAudioFiredRef = useRef(false);
  const handleUrgentChange = (urgent: boolean) => {
    setTimeUrgent(urgent);
    if (urgent && !urgentAudioFiredRef.current) {
      urgentAudioFiredRef.current = true;
      playBackendAudio('habisEdit.mp3');
    }
  };

  // Drag & drop foto (touchscreen): drag foto dari panel kiri lalu jatuhkan ke
  // slot. Tap-tanpa-geser = "arm" (fallback tap-to-place lama tetap jalan).
  const {
    dragProps,
    dragPhoto,
    overSlotId,
    ghostRef,
  } = useDragToPlace({
    onDrop: (slotId, photo) =>
      previewRef.current?.placePhotoInSlotById(slotId, photo.id, photo.url),
    onTap: (photo) => handlePhotoTap({ id: photo.id, url: photo.url }),
  });

  // Jalankan aksi toolbar (zoom/rotate/reset) pada foto aktif, lalu re-render.
  const withActivePhoto = (fn: (obj: fabric.Object) => void) => {
    const canvas = fabricCanvasRef.current;
    const obj = canvas?.getActiveObject();
    if (!canvas || !obj || !obj.data?.isPhoto) return;
    fn(obj);
    obj.setCoords();
    canvas.requestRenderAll();
  };
  // Dedup navigation — Timer dan saveComposition.onSuccess sama-sama push
  // ke /session-end. Tanpa flag ini, mereka bisa double-push kalau fire
  // hampir bersamaan (user klik Confirm di detik ~118, timer expire di 120).
  const navigatedRef = useRef(false);
  // Latch "komposisi sedang/sudah difinalkan" — cegah save & cetak dobel saat
  // tombol Confirm dan timeout terpicu hampir bersamaan (lihat composeSaveAndPrint).
  const finalizingRef = useRef(false);

  const navigateToSessionEnd = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push(`/session-end?sessionId=${sessionId}`);
  };

  // Photo composition tracking
  const {
    slots,
    addPhotoToSlot,
    setFrame: setCompositionFrame,
    setFilter: setCompositionFilter,
  } = usePhotoComposition();

  // Fetch data — disable photos query saat sessionId kosong (saat halaman
  // mounted tanpa param, useEffect di atas akan redirect, tapi kita tetap
  // perlu hindari request ke `/api/photo/session/` yang invalid).
  const { data: photos = [], isLoading: photosLoading } = usePhotos({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  const { data: frames = [], isLoading: framesLoading } = useFrames();

  // Timer config (durasi edit diatur admin). Tunggu termuat sebelum render
  // Timer agar countdown persisted tidak ke-reset (lihat catatan di useAppConfig).
  const { data: appConfig } = useAppConfig();

  // Save composition mutation
  const { mutate: saveComposition, isPending: isSaving } = useSaveComposition();

  // Pre-load semua gambar (thumbnail foto + gambar frame) SEBELUM editor
  // ditampilkan. Tanpa ini, data query selesai lalu <img> di grid baru mulai
  // fetch → foto & frame "pop-in" satu per satu. Dengan preload, load screen
  // tetap tampil sampai semua aset ter-decode, lalu editor muncul utuh.
  const [assetsReady, setAssetsReady] = useState(false);
  const preloadFiredRef = useRef(false);
  useEffect(() => {
    if (preloadFiredRef.current) return;
    if (!sessionId || photosLoading || framesLoading || !appConfig) return;
    preloadFiredRef.current = true;

    const urls = [
      ...photos.map((p) => p.thumbnailUrl ?? p.url),
      ...frames.map((f) => f.imageUrl),
    ].filter((u): u is string => !!u);

    if (urls.length === 0) {
      // Tak ada aset untuk di-preload → langsung siap. Sinkron di dalam effect
      // preload ini disengaja (bukan state turunan), aman dari cascading render
      // karena effect di-guard sekali jalan (preloadFiredRef).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAssetsReady(true);
      return;
    }

    let cancelled = false;
    // Preload satu aset. Kalau gagal — mis. thumbnail BELUM sempat ditulis backend
    // sesaat setelah sesi berakhir — coba lagi beberapa kali dengan jeda pendek
    // sebelum menyerah, supaya editor BENAR-BENAR menunggu foto hasil siap, bukan
    // reveal dengan gambar yang masih 404 lalu "pop-in". URL retry dibiarkan SAMA
    // (bukan cache-bust) supaya begitu berhasil, <img> di grid menyajikannya dari
    // cache secara instan.
    const RETRY_MAX = 4;
    const RETRY_DELAY_MS = 700;
    const preloadOne = (url: string, attempt = 0): Promise<void> =>
      new Promise<void>((resolve) => {
        if (cancelled) return resolve();
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => {
          if (cancelled || attempt >= RETRY_MAX) return resolve();
          setTimeout(
            () => preloadOne(url, attempt + 1).then(resolve),
            RETRY_DELAY_MS,
          );
        };
        img.src = url;
      });

    // Hard-cap 6s: jaring pengaman terakhir kalau ada aset yang tetap gagal/lambat
    // di luar retry — editor tetap muncul, tidak stuck selamanya di load screen.
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000));
    Promise.race([Promise.all(urls.map((u) => preloadOne(u))), timeout]).then(
      () => {
        if (!cancelled) setAssetsReady(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [sessionId, photosLoading, framesLoading, appConfig, photos, frames]);

  // Narasi pembuka editor sekarang mengikuti tutorial (PhotoEditorOnboarding):
  // tiap step tutorial punya suaranya sendiri, jadi tidak ada lagi satu narasi
  // "pilih foto" yang diputar di sini.

  // Loading state — tahan sampai data DAN aset gambar siap supaya editor
  // muncul utuh (tidak pop-in). Juga handle case sessionId kosong, supaya
  // halaman menampilkan spinner sembari router.replace('/package') jalan,
  // BUKAN return null lebih awal yang melanggar Rules of Hooks.
  if (!sessionId || photosLoading || framesLoading || !appConfig || !assetsReady) {
    // Loader ini menyambung MULUS dari transisi "Preparing your photos..." di
    // PhotoSessionPage — animasi + teks sengaja disamakan supaya terasa SATU
    // loading kontinu, bukan "loading beres lalu nunggu lagi". Gate ini menahan
    // editor sampai thumbnail foto + gambar frame benar-benar ter-decode
    // (assetsReady), jadi begitu editor tampil, foto hasil langsung ada.
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-4">
        <StatusAnimation status="processing" className="w-24 h-24" />
        <p className="text-primary font-medium text-lg animate-pulse">
          Preparing your photos...
        </p>
      </div>
    );
  }

  // Frame and filter selection handlers
  const handleFrameSelect = (frame: Frame) => {
    setSelectedFrame(frame);
    setCompositionFrame(frame);
  };

  const handleFilterSelect = (filter: FilterType) => {
    setSelectedFilter(filter);
    setCompositionFilter(filter);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // Tap foto di panel kiri → "arm" untuk ditempatkan (tap lagi = batal pilih).
  const handlePhotoTap = (photo: { id: string; url: string }) => {
    setArmedPhoto((prev) =>
      prev?.photoId === photo.id
        ? null
        : { photoId: photo.id, photoUrl: photo.url },
    );
  };

  // Foto ditempatkan ke slot (via tap) → catat di komposisi & lepas pilihan.
  const handlePhotoPlaced = (
    slotId: string,
    photoId: string,
    photoUrl: string,
  ) => {
    addPhotoToSlot(slotId, photoId, photoUrl);
    setArmedPhoto(null);
  };

  // Confirm Print logic
  const isConfirmEnabled = selectedFrame !== null;

  // Export canvas → save ke backend → cetak → navigate. Dipakai BERSAMA oleh
  // tombol Confirm Print dan jalur timeout. Cetak dilakukan di kedua jalur:
  // customer harus tetap menerima strip fisik walau waktunya keburu habis.
  //
  // multiplier 4 + quality 0.97: strip di-render dari foto raw full-res DSLR,
  // jadi resolusi kerja canvas dinaikkan supaya detail asli kamera terbawa ke
  // hasil akhir & cetak (bukan lagi dibatasi ~1392px seperti multiplier 3).
  const composeSaveAndPrint = async (
    // Frame utuh (bukan cuma id) karena `slots`-nya dipakai untuk mengurutkan
    // slotTransforms — index-nya harus sejajar photoIds/slot_photo_ids.
    frame: Frame,
    photoIds: string[],
    // silent = dipicu timer: error di-log, tidak alert, dan tetap navigate
    // supaya user tidak stuck di halaman.
    silent: boolean,
  ) => {
    // Kedua jalur (tombol Confirm & timeout) kini sama-sama menyimpan DAN
    // mencetak. Kalau user menekan Confirm tepat saat timer habis, keduanya
    // bisa jalan hampir bersamaan → strip tersimpan dua kali & printer menerima
    // dua job. Latch ini memastikan hanya yang pertama yang diproses.
    if (finalizingRef.current) return;
    finalizingRef.current = true;

    // Gagal & user masih di halaman → buka latch supaya bisa dicoba lagi.
    const unlatchForRetry = () => {
      if (!silent) finalizingRef.current = false;
    };

    if (!fabricCanvasRef.current) {
      if (silent) navigateToSessionEnd();
      else finalizingRef.current = false;
      return;
    }

    try {
      const exported = await exportComposition(fabricCanvasRef.current, {
        format: 'jpeg',
        quality: 0.97,
        multiplier: 4,
      });

      // Diambil dari canvas yang sama dengan yang baru di-export, jadi angkanya
      // dijamin menggambarkan strip yang benar-benar tersimpan.
      const slotTransforms = collectSlotTransforms(
        fabricCanvasRef.current,
        frame.slots,
      );

      saveComposition(
        {
          sessionId,
          frameId: frame.id,
          filter: selectedFilter,
          photoIds,
          slotTransforms,
          composedImage: exported.blob,
        },
        {
          onSuccess: () => {
            // Kirim strip ke printer fisik. Non-blocking & non-fatal: kalau
            // printer offline/gagal, user tetap lanjut ke halaman download.
            printComposition(sessionId).catch((err) => {
              console.warn('[PhotoEditorPage] auto-print gagal:', err);
            });
            navigateToSessionEnd();
          },
          onError: (error) => {
            console.error('Failed to save composition:', error);
            unlatchForRetry();
            if (silent) navigateToSessionEnd();
            else alert('Failed to save composition. Please try again.');
          },
        },
      );
    } catch (error) {
      console.error('Export failed:', error);
      unlatchForRetry();
      if (silent) navigateToSessionEnd();
      else alert('Failed to export composition. Please try again.');
    }
  };

  const handleConfirmPrint = async () => {
    if (!isConfirmEnabled) return;

    // URUT SESUAI SLOT frame — sama seperti jalur timeout. Backend memakai
    // index-nya sebagai pemetaan slot→foto (slot_photo_ids) DAN slot→transform,
    // jadi urutannya tidak boleh diturunkan dari urutan lain.
    const frame = selectedFrame!;
    const photoIds = frame.slots
      .map((s) => slots[s.id]?.photoId)
      .filter((id): id is string => !!id);

    // Jumlah foto yang dibutuhkan mengikuti jumlah slot pada frame terpilih
    // (mis. 2, 4, 6, 8). Backend strip generator memakai slot frame secara
    // dinamis, jadi SEMUA slot harus terisi sebelum compose — kalau kurang,
    // GIF + framed strip jadi tidak konsisten. Block di sini supaya user dapat
    // pesan yang jelas, bukan error 400 dari server.
    const requiredCount = frame.slots.length;
    if (photoIds.length < requiredCount) {
      alert(
        `Please select ${requiredCount} photos first (currently ${photoIds.length}/${requiredCount}).`,
      );
      return;
    }

    await composeSaveAndPrint(frame, photoIds, false);
  };

  // Tunggu sampai `check` bernilai true (polling ringan). Dipakai menunggu
  // PreviewArea selesai memuat frame yang baru dipilih otomatis.
  const waitUntil = async (check: () => boolean, timeoutMs: number) => {
    const start = Date.now();
    while (!check()) {
      if (Date.now() - start > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 80));
    }
    return true;
  };

  // Timer habis → PASTIKAN customer tetap dapat strip & cetakan:
  // 1. Belum pilih frame? Pakai frame pertama.
  // 2. Slot masih kosong? Isi otomatis dengan foto sesi (utamakan yang belum
  //    terpakai, lalu diulang kalau jumlah foto lebih sedikit dari slot).
  // 3. Compose → save → print → ke halaman QR.
  const finishOnTimeout = async () => {
    try {
      // ── 1. Pastikan ada frame ──────────────────────────────────────────
      const frameWasPreselected = selectedFrame !== null;
      const frame = selectedFrame ?? frames[0] ?? null;
      if (!frame || photos.length === 0) {
        console.warn(
          '[PhotoEditorPage] Timeout tanpa frame/foto — navigate tanpa save',
        );
        navigateToSessionEnd();
        return;
      }
      if (!frameWasPreselected) {
        setSelectedFrame(frame);
        setCompositionFrame(frame);
      }

      // Tunggu gambar frame benar-benar termuat di canvas sebelum menaruh foto.
      const ready = await waitUntil(
        () => previewRef.current?.getReadyFrameId() === frame.id,
        6000,
      );
      if (!ready) {
        console.warn('[PhotoEditorPage] Frame tak kunjung siap — navigate');
        navigateToSessionEnd();
        return;
      }

      // ── 2. Isi slot yang masih kosong ──────────────────────────────────
      // slotId → photoId. Hanya diseed dari komposisi kalau frame-nya memang
      // sudah dipilih user (kalau frame baru di-set, slot lama tak relevan).
      const assigned = new Map<string, string>();
      if (frameWasPreselected) {
        for (const s of Object.values(slots)) {
          if (s.photoId) assigned.set(s.slotId, s.photoId);
        }
      }

      const emptyIds = previewRef.current?.getEmptySlotIds() ?? [];
      if (emptyIds.length > 0) {
        const usedIds = new Set(assigned.values());
        // Utamakan foto yang belum dipakai; sisanya ulang dari awal daftar.
        const queue = [...photos.filter((p) => !usedIds.has(p.id)), ...photos];
        for (let i = 0; i < emptyIds.length; i++) {
          const slotId = emptyIds[i];
          const photo = queue[i % queue.length];
          await previewRef.current?.placePhotoInSlotById(
            slotId,
            photo.id,
            photo.url,
            { select: false },
          );
          assigned.set(slotId, photo.id);
        }
      }

      // ── 3. photoIds URUT SESUAI SLOT frame ─────────────────────────────
      // Urutan ini yang dipakai backend sebagai slot_photo_ids (pemetaan
      // slot→foto untuk live GIF), jadi jangan diturunkan dari urutan lain.
      const photoIds = frame.slots
        .map((s) => assigned.get(s.id))
        .filter((id): id is string => !!id);

      if (photoIds.length < frame.slots.length) {
        console.warn(
          '[PhotoEditorPage] Auto-isi belum lengkap',
          `(${photoIds.length}/${frame.slots.length}) — navigate tanpa save`,
        );
        navigateToSessionEnd();
        return;
      }

      await composeSaveAndPrint(frame, photoIds, true);
    } catch (error) {
      console.error('[PhotoEditorPage] Gagal menuntaskan saat timeout:', error);
      navigateToSessionEnd();
    }
  };

  const handleTimeUp = () => {
    void finishOnTimeout();
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* 2 menit untuk pilih frame + foto, lalu auto ke session-end */}
      <Timer
        duration={appConfig?.photoEditorTimeoutSecs ?? 120}
        onTimeUp={handleTimeUp}
        storageKey={sessionId ? `photo-editor:${sessionId}` : null}
        urgentWhenLow
        onUrgentChange={handleUrgentChange}
        paused={isOnboardingOpen}
      />

      {/* Semburat merah tipis di tepi layar saat waktu <15 detik — isyarat halus
          waktu menipis. pointer-events-none supaya tak mengganggu interaksi. */}
      {timeUrgent && (
        <div className="pointer-events-none fixed inset-0 z-40 animate-urgent-vignette" />
      )}

      {/* Header */}
      <div className="w-full text-center py-1 shrink-0 relative flex items-center justify-center px-6">
        <h1 className="text-primary text-[60px] font-bold tracking-tight">
          Select & Edit
        </h1>
      </div>

      {/* Main Content - 3 panels + confirm button */}
      <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 gap-3">
        {/* Panels row */}
        <div className="flex-1 flex items-stretch gap-3 min-h-0">
          {/* Left Panel */}
          <div className="w-84.25 shrink-0">
            <PhotoSelectionPanel
              photos={photos}
              isLoading={photosLoading}
              armedPhotoId={armedPhoto?.photoId ?? null}
              getDragProps={dragProps}
              draggingPhotoId={dragPhoto?.id ?? null}
            />
          </div>

          {/* Center Panel */}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            <PreviewArea
              ref={previewRef}
              selectedFrame={selectedFrame}
              selectedFilter={selectedFilter}
              armedPhoto={armedPhoto}
              isDragging={dragPhoto !== null}
              dragOverSlotId={overSlotId}
              onPhotoPlaced={handlePhotoPlaced}
              onActiveSlotChange={setActiveSlotId}
              onCanvasReady={(canvas) => {
                fabricCanvasRef.current = canvas;
              }}
            />
          </div>

          {/* Right Panel */}
          <div className="w-84.25 shrink-0">
            <FrameSelectionPanel
              frames={frames}
              selectedFrame={selectedFrame}
              selectedFilter={selectedFilter}
              activeTab={activeTab}
              onFrameSelect={handleFrameSelect}
              onFilterSelect={handleFilterSelect}
              onTabChange={handleTabChange}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-84.25 shrink-0">
            <button
              onClick={() => setIsOnboardingOpen(true)}
              className="w-full px-8 py-4 rounded-[19.28px] text-[#ffff] border-2 border-white/60 bg-blue-100/34 hover:border-white/80 font-bold text-[22px] flex items-center justify-center gap-6 cursor-pointer transition active:scale-95"
              title="How to Use"
            >
              <HelpCircle className="w-6 h-6" />
              <span>How to Use</span>
            </button>
          </div>
          <div className="flex-1 min-w-0 flex justify-center">
            {activeSlotId && (
              <SlotAdjustToolbar
                onZoomIn={() => withActivePhoto((o) => zoomPhoto(o, 1))}
                onZoomOut={() => withActivePhoto((o) => zoomPhoto(o, -1))}
                onRotateLeft={() => withActivePhoto((o) => rotatePhoto(o, -1))}
                onRotateRight={() => withActivePhoto((o) => rotatePhoto(o, 1))}
                onReset={() => withActivePhoto((o) => resetPhoto(o))}
              />
            )}
          </div>
          <div className="w-84.25 shrink-0">
            <ConfirmPrintButton
              disabled={!isConfirmEnabled}
              onClick={handleConfirmPrint}
            />
          </div>
        </div>
      </div>

      {/* Ghost foto yang mengambang mengikuti jari saat drag ke slot. */}
      <DragGhost photo={dragPhoto} ghostRef={ghostRef} />

      {/* Loading overlay during save */}
      {isSaving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <StatusAnimation status="waiting" className="w-16 h-16" />
          </div>
        </div>
      )}

      <PhotoEditorOnboarding
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
      />
    </div>
  );
}
