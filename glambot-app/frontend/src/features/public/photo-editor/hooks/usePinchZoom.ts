'use client';

import { useEffect } from 'react';
import { fabric } from 'fabric';
import { setPhotoScale, movePhotoBy } from '../lib/slotTransform';

/**
 * Pinch-to-zoom + two-finger pan LANGSUNG di atas foto dalam slot (touchscreen).
 *
 * Fabric v5 tidak punya gesture multi-touch bawaan, jadi kita pasang listener
 * touch native di container preview (fase capture) supaya menang lebih dulu dari
 * handler drag single-finger milik fabric:
 * - 1 jari  → dibiarkan; fabric menggeser foto seperti biasa.
 * - 2 jari  → kita ambil alih: jarak antar-jari mengatur skala (di-clamp ke
 *   batas cover/zoom), titik-tengah menggeser foto. preventDefault + stop
 *   propagation supaya browser tidak zoom halaman & fabric tidak ikut menggeser.
 *
 * Skala & posisi tetap dijaga menutupi slot lewat helper slotTransform.
 */
export function usePinchZoom(
  containerRef: React.RefObject<HTMLElement | null>,
  getCanvas: () => fabric.Canvas | null,
  /** Skala tampilan container→canvas (screen px ÷ scale = canvas px). */
  displayScale: number,
  /** Beri tahu parent foto mana yang jadi target (untuk toolbar/highlight). */
  onActiveSlot?: (slotId: string | null) => void,
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let target: fabric.Object | null = null;
    let lastDist = 0;
    let lastMidX = 0;
    let lastMidY = 0;

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    // Cari foto pada titik layar (fallback saat tak ada active object).
    const photoAt = (clientX: number, clientY: number): fabric.Object | null => {
      const canvas = getCanvas();
      if (!canvas) return null;
      const rect = el.getBoundingClientRect();
      const cx = (clientX - rect.left) / displayScale;
      const cy = (clientY - rect.top) / displayScale;
      const photos = canvas.getObjects().filter((o) => o.data?.isPhoto);
      // reverse: pilih yang paling atas bila slot bertumpuk.
      for (let i = photos.length - 1; i >= 0; i--) {
        const s = photos[i].data?.slot;
        if (s && cx >= s.x && cx <= s.x + s.width && cy >= s.y && cy <= s.y + s.height)
          return photos[i];
      }
      return null;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const canvas = getCanvas();
      if (!canvas) return;

      // Jari kedua baru turun → Fabric mungkin sedang drag objek dari jari
      // pertama. Hentikan drag itu: hapus __currentTransform internal Fabric
      // supaya Fabric berhenti menggerakkan objek manapun pada touchmove
      // berikutnya. Ini lebih andal daripada fire('mouse:up') yang bisa
      // memicu side-effect lain (selection:cleared dll).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = canvas as any;
      if (c.__currentTransform) {
        c.__currentTransform = null;
      }

      const m = mid(e.touches);
      const active = canvas.getActiveObject();
      const activePhoto = active?.data?.isPhoto ? active : null;

      // Cari foto di bawah masing-masing jari & titik tengah secara presisi.
      const photo0 = photoAt(e.touches[0].clientX, e.touches[0].clientY);
      const photo1 = photoAt(e.touches[1].clientX, e.touches[1].clientY);
      const photoMid = photoAt(m.x, m.y);

      // Prioritas target:
      // 1. Jika ada foto aktif dan salah satu jari berada di slotnya -> tetap targetkan foto aktif tersebut.
      // 2. Foto di bawah jari pertama (primary touch).
      // 3. Foto di bawah jari kedua.
      // 4. Foto di titik tengah antar-jari.
      // 5. Fallback ke foto yang sedang aktif saat ini.
      if (activePhoto && (photo0 === activePhoto || photo1 === activePhoto)) {
        target = activePhoto;
      } else {
        target = photo0 ?? photo1 ?? photoMid ?? activePhoto;
      }

      if (!target) return;

      // Jadikan target aktif → toolbar adjust muncul & tersorot.
      if (canvas.getActiveObject() !== target) {
        canvas.setActiveObject(target);
        onActiveSlot?.((target.data?.slotId as string) ?? null);
        canvas.requestRenderAll();
      }
      lastDist = dist(e.touches);
      lastMidX = m.x;
      lastMidY = m.y;
      e.preventDefault();
      e.stopPropagation();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !target) return;
      const canvas = getCanvas();
      if (!canvas) return;

      const d = dist(e.touches);
      const m = mid(e.touches);

      // Skala: rasio jarak antar-jari (invarian terhadap displayScale).
      if (lastDist > 0) {
        setPhotoScale(target, (target.scaleX ?? 1) * (d / lastDist));
      }
      // Pan: geser titik-tengah, dikonversi ke ruang canvas.
      const dx = (m.x - lastMidX) / displayScale;
      const dy = (m.y - lastMidY) / displayScale;
      if (dx || dy) movePhotoBy(target, dx, dy);

      target.setCoords();
      canvas.requestRenderAll();

      lastDist = d;
      lastMidX = m.x;
      lastMidY = m.y;
      e.preventDefault();
      e.stopPropagation();
    };

    const onTouchEnd = (e: TouchEvent) => {
      // Selesai saat turun di bawah 2 jari.
      if (e.touches.length < 2) {
        target = null;
        lastDist = 0;
      }
    };

    // Capture=true supaya menang dulu dari handler fabric di upperCanvasEl.
    // passive:false supaya preventDefault menahan zoom halaman.
    const opts = { capture: true, passive: false } as const;
    el.addEventListener('touchstart', onTouchStart, opts);
    el.addEventListener('touchmove', onTouchMove, opts);
    el.addEventListener('touchend', onTouchEnd, opts);
    el.addEventListener('touchcancel', onTouchEnd, opts);

    return () => {
      el.removeEventListener('touchstart', onTouchStart, opts);
      el.removeEventListener('touchmove', onTouchMove, opts);
      el.removeEventListener('touchend', onTouchEnd, opts);
      el.removeEventListener('touchcancel', onTouchEnd, opts);
    };
  }, [containerRef, getCanvas, displayScale, onActiveSlot]);
}
