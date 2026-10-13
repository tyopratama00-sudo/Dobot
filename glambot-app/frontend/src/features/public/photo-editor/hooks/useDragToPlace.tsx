'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * Drag-and-drop foto → slot untuk touchscreen (kiosk), dibangun di atas Pointer
 * Events supaya seragam untuk sentuh/mouse/pen. HTML5 `draggable` tidak dipakai
 * karena tidak jalan di layar sentuh.
 *
 * Fokus "mulus":
 * - Ghost foto mengambang mengikuti jari lewat `transform: translate3d(...)`
 *   yang ditulis LANGSUNG ke DOM tiap pointermove (bukan lewat React state),
 *   jadi tanpa lag re-render.
 * - Aktivasi cerdas biar tidak berebut dengan scroll grid foto:
 *     • geser mendatar / agak menyamping  → langsung angkat (drag)
 *     • tahan diam sebentar               → angkat (long-press)
 *     • geser tegak lurus                 → biarkan list scroll (batal drag)
 * - Selama drag, scroll native ditahan (touchmove non-passive preventDefault).
 * - Kalau jari dilepas tanpa sempat "terangkat" → dianggap TAP (fallback pilih
 *   foto lama tetap berfungsi).
 *
 * Drop dideteksi via document.elementFromPoint → cari elemen ber-atribut
 * `data-drop-slot`. Slot yang sedang di-hover dilaporkan lewat `overSlotId`
 * supaya PreviewArea bisa menyorotnya.
 */

export interface DragPhoto {
  id: string;
  url: string;
}

interface UseDragToPlaceOptions {
  /** Dipanggil saat foto dijatuhkan tepat di atas sebuah slot. */
  onDrop: (slotId: string, photo: DragPhoto) => void;
  /** Dipanggil saat gesture ternyata cuma tap (bukan drag). */
  onTap?: (photo: DragPhoto) => void;
}

// Ambang gerak (px, ruang layar) untuk membedakan niat. Dibuat responsif supaya
// foto terasa "gampang diangkat": jarak aktivasi kecil + long-press pendek, tapi
// SCROLL_LOCK tetap sedikit lebih besar dari ACTIVATE_DIST agar scroll list
// vertikal tidak keburu ke-angkat jadi drag.
const ACTIVATE_DIST = 6; // total gerak yang memicu pengangkatan
const SCROLL_LOCK_DIST = 10; // gerak tegak dominan → dianggap scroll, batalkan
const HOLD_MS = 120; // tahan-diam untuk mengangkat

export function useDragToPlace({ onDrop, onTap }: UseDragToPlaceOptions) {
  // Info drag aktif untuk merender ghost (null = tidak sedang drag).
  const [dragPhoto, setDragPhoto] = useState<DragPhoto | null>(null);
  const [overSlotId, setOverSlotId] = useState<string | null>(null);

  const ghostRef = useRef<HTMLDivElement | null>(null);
  const onDropRef = useRef(onDrop);
  const onTapRef = useRef(onTap);
  useEffect(() => {
    onDropRef.current = onDrop;
    onTapRef.current = onTap;
  }, [onDrop, onTap]);

  // Semua status transient gesture disimpan di ref agar tidak memicu render.
  const g = useRef<{
    photo: DragPhoto | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pointerId: number | null;
    activated: boolean;
    holdTimer: ReturnType<typeof setTimeout> | null;
  }>({
    photo: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    pointerId: null,
    activated: false,
    holdTimer: null,
  });

  // Posisikan ghost di titik jari (sedikit ke atas agar foto terlihat).
  const moveGhost = (x: number, y: number) => {
    const el = ghostRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y - 28}px, 0) translate(-50%, -50%)`;
  };

  const slotIdAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>('[data-drop-slot]')?.dataset.dropSlot ?? null;
  };

  // Handler window bersifat stabil (dipasang/dilepas dengan identitas yang sama).
  // Semua state dibaca dari ref `g`, jadi tak perlu masuk dependency.
  const handlers = useRef({
    move: (_e: globalThis.PointerEvent) => {},
    up: (_e: globalThis.PointerEvent) => {},
    cancel: (_e: globalThis.PointerEvent) => {},
    preventTouch: (_e: TouchEvent) => {},
  });

  const teardown = useCallback(() => {
    const s = g.current;
    if (s.holdTimer) clearTimeout(s.holdTimer);
    window.removeEventListener('pointermove', handlers.current.move);
    window.removeEventListener('pointerup', handlers.current.up);
    window.removeEventListener('pointercancel', handlers.current.cancel);
    window.removeEventListener('touchmove', handlers.current.preventTouch);
    s.photo = null;
    s.pointerId = null;
    s.activated = false;
    s.holdTimer = null;
    setDragPhoto(null);
    setOverSlotId(null);
  }, []);

  const activate = useCallback((x: number, y: number) => {
    const s = g.current;
    if (s.activated || !s.photo) return;
    s.activated = true;
    s.lastX = x;
    s.lastY = y;
    if (s.holdTimer) {
      clearTimeout(s.holdTimer);
      s.holdTimer = null;
    }
    setDragPhoto(s.photo); // mount ghost → diposisikan oleh useLayoutEffect
    setOverSlotId(slotIdAt(x, y));
  }, []);

  // Posisikan ghost tepat setelah ter-mount (di titik jari), termasuk saat
  // diangkat lewat tahan-diam (belum ada pointermove untuk memindahkannya).
  useLayoutEffect(() => {
    if (dragPhoto) moveGhost(g.current.lastX, g.current.lastY);
  }, [dragPhoto]);

  // Isi handler stabil sekali; mereka membaca ref sehingga selalu terkini.
  useEffect(() => {
    handlers.current.move = (e) => {
      const s = g.current;
      if (s.pointerId !== e.pointerId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;

      if (!s.activated) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        // Gerak tegak dominan sebelum terangkat → user sedang scroll list.
        if (ady > SCROLL_LOCK_DIST && ady > adx) {
          teardown();
          return;
        }
        if (Math.hypot(dx, dy) > ACTIVATE_DIST) activate(e.clientX, e.clientY);
        else return;
      }

      s.lastX = e.clientX;
      s.lastY = e.clientY;
      moveGhost(e.clientX, e.clientY);
      const slot = slotIdAt(e.clientX, e.clientY);
      setOverSlotId((prev) => (prev === slot ? prev : slot));
    };

    handlers.current.up = (e) => {
      const s = g.current;
      if (s.pointerId !== e.pointerId) return;
      const { photo, activated } = s;
      if (activated && photo) {
        const slot = slotIdAt(e.clientX, e.clientY);
        if (slot) onDropRef.current(slot, photo);
      } else if (photo) {
        onTapRef.current?.(photo); // fallback: tap = pilih foto
      }
      teardown();
    };

    // pointercancel (mis. sistem/scroll mengambil alih) → batalkan tanpa
    // dianggap tap, supaya foto tidak ter-"arm" tak sengaja.
    handlers.current.cancel = (e) => {
      if (g.current.pointerId !== e.pointerId) return;
      teardown();
    };

    handlers.current.preventTouch = (e) => {
      if (g.current.activated) e.preventDefault();
    };
  }, [activate, teardown]);

  const start = useCallback(
    (photo: DragPhoto) => (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const s = g.current;
      if (s.pointerId !== null) return; // sudah ada gesture berjalan
      s.photo = photo;
      s.startX = e.clientX;
      s.startY = e.clientY;
      s.pointerId = e.pointerId;
      s.activated = false;

      const px = e.clientX;
      const py = e.clientY;
      s.holdTimer = setTimeout(() => activate(px, py), HOLD_MS);

      window.addEventListener('pointermove', handlers.current.move);
      window.addEventListener('pointerup', handlers.current.up);
      window.addEventListener('pointercancel', handlers.current.cancel);
      window.addEventListener('touchmove', handlers.current.preventTouch, {
        passive: false,
      });
    },
    [activate],
  );

  // Bersihkan kalau komponen unmount di tengah drag.
  useEffect(() => teardown, [teardown]);

  return {
    /** Attach ke elemen sumber: `<button {...dragProps(photo)} />`. */
    dragProps: (photo: DragPhoto) => ({
      onPointerDown: start(photo),
      style: { touchAction: 'pan-y' as const },
    }),
    /** Info foto yang sedang di-drag (null saat idle). */
    dragPhoto,
    /** Id slot yang sedang di-hover ghost (untuk highlight). */
    overSlotId,
    /** Ref untuk node ghost (dipasang di <DragGhost/>). */
    ghostRef,
  };
}

/** Ghost foto yang mengambang mengikuti jari. Render di root halaman editor. */
export function DragGhost({
  photo,
  ghostRef,
}: {
  photo: DragPhoto | null;
  ghostRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!photo) return null;
  return (
    <div
      ref={ghostRef}
      className="pointer-events-none fixed left-0 top-0 z-[60] h-28 w-28 overflow-hidden rounded-2xl shadow-[0_12px_40px_rgba(17,45,78,0.55)] ring-4 ring-[#3F72AF] will-change-transform"
      style={{ transform: 'translate3d(-9999px,-9999px,0)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt=""
        draggable={false}
        className="h-full w-full scale-105 object-cover opacity-95"
      />
    </div>
  );
}
