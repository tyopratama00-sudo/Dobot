import { fabric } from 'fabric';
import type { FrameSlot } from '../api/getFrames';

/**
 * Transform helpers untuk foto di dalam slot (fitur adjust: zoom/rotate/move).
 *
 * Konsep: tiap foto punya `clipPath` dengan `absolutePositioned: true`, jadi clip
 * adalah jendela TETAP di ruang koordinat slot. Foto boleh di-scale/rotate/geser
 * di belakang jendela itu dan tetap terpotong rapi mengikuti bentuk slot.
 *
 * Data yang dipakai (di-set saat fitPhotoToSlot):
 * - data.slot           : { x, y, width, height, ... } geometri slot
 * - data.baseScale      : skala "cover" awal (batas zoom-out minimum)
 * - data.baseLeft/Top   : posisi tengah awal (untuk reset)
 * - data.originalWidth/Height : dimensi asli gambar (untuk hitung cover saat rotasi)
 */

const ROTATE_STEP_DEG = 15;
const ZOOM_STEP = 1.12;
/** Batas zoom-in relatif terhadap skala cover awal. */
const MAX_SCALE_RATIO = 4;

interface PhotoData {
  slot?: { x: number; y: number; width: number; height: number };
  baseScale?: number;
  baseLeft?: number;
  baseTop?: number;
  originalWidth?: number;
  originalHeight?: number;
}

const getData = (obj: fabric.Object): PhotoData =>
  (obj.data as PhotoData | undefined) ?? {};

/**
 * Skala minimum agar foto tetap menutupi slot pada sudut rotasi tertentu.
 *
 * Saat foto diputar θ, untuk menutupi persegi slot (w×h) foto (sebelum rotasi)
 * harus cukup besar menutupi bounding box slot yang "diputar balik":
 *   needW = w·|cosθ| + h·|sinθ|
 *   needH = w·|sinθ| + h·|cosθ|
 * Ini mencegah sudut slot bocor (putih) saat foto dirotasi.
 */
const minCoverScale = (obj: fabric.Object, angleDeg: number): number => {
  const d = getData(obj);
  const slot = d.slot;
  const ow = d.originalWidth ?? obj.width ?? 1;
  const oh = d.originalHeight ?? obj.height ?? 1;
  if (!slot) return d.baseScale ?? obj.scaleX ?? 1;

  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const needW = slot.width * c + slot.height * s;
  const needH = slot.width * s + slot.height * c;
  return Math.max(needW / ow, needH / oh);
};

/**
 * Geser foto seminimal mungkin agar bounding box-nya tetap menutupi slot.
 * Dipanggil saat user men-drag foto dan setelah zoom/rotate.
 */
export const clampPhotoToSlot = (obj: fabric.Object): void => {
  const slot = getData(obj).slot;
  if (!slot) return;

  obj.setCoords();
  // absolute=true: koordinat canvas apa adanya (tanpa viewport transform).
  const br = obj.getBoundingRect(true, true);

  let dx = 0;
  if (br.left > slot.x) dx = slot.x - br.left;
  else if (br.left + br.width < slot.x + slot.width)
    dx = slot.x + slot.width - (br.left + br.width);

  let dy = 0;
  if (br.top > slot.y) dy = slot.y - br.top;
  else if (br.top + br.height < slot.y + slot.height)
    dy = slot.y + slot.height - (br.top + br.height);

  if (dx !== 0 || dy !== 0) {
    obj.left = (obj.left ?? 0) + dx;
    obj.top = (obj.top ?? 0) + dy;
    obj.setCoords();
  }
};

/**
 * Batas skala foto pada sudut saat ini:
 * - min = skala cover (jangan biarkan sudut slot bocor)
 * - max = MAX_SCALE_RATIO × skala cover awal
 */
export const scaleBounds = (obj: fabric.Object): { min: number; max: number } => {
  const base = getData(obj).baseScale ?? obj.scaleX ?? 1;
  return {
    min: Math.max(base, minCoverScale(obj, obj.angle ?? 0)),
    max: base * MAX_SCALE_RATIO,
  };
};

/** Set skala foto ke nilai absolut (di-clamp ke batas cover/zoom), lalu clamp posisi. */
export const setPhotoScale = (obj: fabric.Object, scale: number): void => {
  const { min, max } = scaleBounds(obj);
  obj.scale(Math.max(min, Math.min(max, scale)));
  clampPhotoToSlot(obj);
};

/** Geser foto sebesar (dx, dy) di ruang koordinat canvas, lalu clamp cover. */
export const movePhotoBy = (obj: fabric.Object, dx: number, dy: number): void => {
  obj.left = (obj.left ?? 0) + dx;
  obj.top = (obj.top ?? 0) + dy;
  clampPhotoToSlot(obj);
};

/** Zoom foto aktif. dir > 0 = perbesar, dir < 0 = perkecil. */
export const zoomPhoto = (obj: fabric.Object, dir: 1 | -1): void => {
  const factor = dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  setPhotoScale(obj, (obj.scaleX ?? 1) * factor);
};

/** Putar foto aktif. dir = 1 (searah jarum jam) atau -1. */
export const rotatePhoto = (obj: fabric.Object, dir: 1 | -1): void => {
  const nextAngle = (obj.angle ?? 0) + dir * ROTATE_STEP_DEG;
  obj.rotate(nextAngle);

  // Pastikan skala masih menutupi slot pada sudut baru; kalau kurang, naikkan.
  const need = minCoverScale(obj, nextAngle);
  if ((obj.scaleX ?? 0) < need) obj.scale(need);

  clampPhotoToSlot(obj);
};

/**
 * Transform satu slot, dinyatakan RELATIF terhadap cover-fit slot — bukan
 * dalam pixel sumber. Ini yang dikirim ke backend supaya generator GIF live
 * bisa membingkai burst frame sama seperti hasil editan user.
 *
 * Kenapa relatif: burst frame itu liveview mentah (resolusi & aspect-nya beda
 * dari foto DSLR full-res yang diedit user). Kalau transform disimpan dalam
 * pixel sumber, backend harus menebak-nebak konversinya. Dengan basis
 * cover-fit, backend cukup cover-fit burst-nya dulu lalu terapkan angka-angka
 * di bawah — hasilnya nyaris identik walau aspect sumbernya beda tipis.
 */
export interface SlotTransform {
  /** Skala relatif terhadap cover: 1 = persis cover, 2 = zoom 2×. */
  scale: number;
  /** Rotasi dalam derajat, searah jarum jam (sama dengan fabric `angle`). */
  angle: number;
  /** Geser titik tengah foto dari titik tengah slot, dalam satuan lebar slot. */
  offsetX: number;
  /** Geser titik tengah foto dari titik tengah slot, dalam satuan tinggi slot. */
  offsetY: number;
}

/** Transform identitas = foto pas cover di tengah slot, tanpa rotasi. */
const IDENTITY_TRANSFORM: SlotTransform = {
  scale: 1,
  angle: 0,
  offsetX: 0,
  offsetY: 0,
};

/** Bulatkan ke 4 desimal — cukup presisi, tapi JSON-nya tidak penuh noise float. */
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Kumpulkan transform tiap slot dari object foto di canvas, URUT sesuai
 * `slots` frame. Slot yang fotonya tidak ketemu diisi transform identitas
 * supaya panjang array SELALU sama dengan jumlah slot — backend memakai
 * index array ini sebagai pemetaan ke slot, sama seperti slot_photo_ids.
 */
export const collectSlotTransforms = (
  canvas: fabric.Canvas,
  slots: FrameSlot[],
): SlotTransform[] => {
  const photos = canvas.getObjects().filter((o) => o.data?.isPhoto);

  return slots.map((slot) => {
    const obj = photos.find((o) => o.data?.slotId === slot.id);
    if (!obj) return IDENTITY_TRANSFORM;

    const base = getData(obj).baseScale ?? obj.scaleX ?? 1;
    if (!base || slot.width <= 0 || slot.height <= 0) return IDENTITY_TRANSFORM;

    // originX/originY foto = 'center' (lihat fitPhotoToSlot), jadi left/top
    // memang titik tengah foto — tidak perlu koreksi setengah dimensi.
    const centerX = slot.x + slot.width / 2;
    const centerY = slot.y + slot.height / 2;

    return {
      scale: round4((obj.scaleX ?? base) / base),
      angle: round4(obj.angle ?? 0),
      offsetX: round4(((obj.left ?? centerX) - centerX) / slot.width),
      offsetY: round4(((obj.top ?? centerY) - centerY) / slot.height),
    };
  });
};

/** Kembalikan foto ke posisi/skala/rotasi cover awal. */
export const resetPhoto = (obj: fabric.Object): void => {
  const d = getData(obj);
  obj.set({
    scaleX: d.baseScale ?? obj.scaleX,
    scaleY: d.baseScale ?? obj.scaleY,
    angle: 0,
    left: d.baseLeft ?? obj.left,
    top: d.baseTop ?? obj.top,
  });
  obj.setCoords();
};
