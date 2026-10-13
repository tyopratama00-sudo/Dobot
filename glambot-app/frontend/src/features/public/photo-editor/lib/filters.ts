import { fabric } from 'fabric';
import { Image as FabricImage } from 'fabric/fabric-impl';

// Foto raw dari DSLR full-res (sisi panjang ±6000px) JAUH lebih besar dari
// default fabric.textureSize (2048). Saat filter di-apply lewat backend WebGL,
// sumber yang melebihi textureSize hanya dirender bagian pojok kiri-atasnya →
// foto tampak "kepotong" di dalam slot. Naikkan ke 8192 supaya menampung sisi
// panjang DSLR utuh. Kalau GPU tidak mendukung ukuran ini, fabric otomatis
// fallback ke backend Canvas2D (tanpa batas ukuran tekstur), jadi hasil tetap
// tidak kepotong. WAJIB di-set SEBELUM applyFilters pertama (backend filter
// dibuat lazy memakai nilai ini), jadi ditaruh di module-load — modul ini hanya
// diimpor komponen 'use client' sehingga eksekusi terjadi di browser.
if (typeof window !== 'undefined' && fabric.textureSize < 8192) {
  fabric.textureSize = 8192;
}

// Definisi KANONIK FilterType. Modul lain (mis. PhotoEditorPage) me-re-export
// dari sini agar tidak ada dua definisi yang bisa drift.
export type FilterType =
  | 'original'
  | 'warm'
  | 'cool'
  | 'vintage'
  | 'dramatic'
  | 'mono'
  | 'sepia'
  | 'vivid'
  | 'soft'
  | 'film'
  | 'noir'
  | 'sunset'
  | 'mint'
  | 'pastel'
  | 'blush'
  | 'moody';

/**
 * Get Fabric.js filter array for given filter type.
 * Each case returns an array of Fabric image filters applied left-to-right.
 */
export const getFiltersByType = (
  filterType: FilterType,
): fabric.IBaseFilter[] => {
  switch (filterType) {
    case 'original':
      return [];

    case 'warm':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            1.1, 0, 0, 0, 0.05, // boost red
            0, 1.0, 0, 0, 0.03, // slight green
            0, 0, 0.9, 0, 0,    // reduce blue
            0, 0, 0, 1, 0,
          ],
        }),
      ];

    case 'cool':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            0.9, 0, 0, 0, 0,    // reduce red
            0, 1.0, 0, 0, 0.02, // slight green
            0, 0, 1.1, 0, 0.05, // boost blue
            0, 0, 0, 1, 0,
          ],
        }),
      ];

    case 'vintage':
      return [
        new fabric.Image.filters.Sepia(),
        new fabric.Image.filters.Brightness({ brightness: 0.05 }),
        new fabric.Image.filters.Contrast({ contrast: -0.1 }),
      ];

    case 'dramatic':
      return [
        new fabric.Image.filters.Contrast({ contrast: 0.3 }),
        new fabric.Image.filters.Saturation({ saturation: 0.4 }),
      ];

    case 'mono':
      return [
        new fabric.Image.filters.Grayscale(),
        new fabric.Image.filters.Contrast({ contrast: 0.12 }),
      ];

    case 'sepia':
      return [
        new fabric.Image.filters.Sepia(),
        new fabric.Image.filters.Contrast({ contrast: 0.05 }),
      ];

    case 'vivid':
      return [
        new fabric.Image.filters.Saturation({ saturation: 0.5 }),
        new fabric.Image.filters.Contrast({ contrast: 0.12 }),
      ];

    case 'soft':
      return [
        new fabric.Image.filters.Saturation({ saturation: -0.15 }),
        new fabric.Image.filters.Contrast({ contrast: -0.12 }),
        new fabric.Image.filters.Brightness({ brightness: 0.06 }),
      ];

    case 'film':
      return [
        new fabric.Image.filters.Saturation({ saturation: -0.1 }),
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            1.05, 0, 0, 0, 0.03,
            0, 1.0, 0, 0, 0.02,
            0, 0, 0.92, 0, 0,
            0, 0, 0, 1, 0,
          ],
        }),
        new fabric.Image.filters.Noise({ noise: 25 }),
      ];

    case 'noir':
      return [
        new fabric.Image.filters.Grayscale(),
        new fabric.Image.filters.Contrast({ contrast: 0.35 }),
        new fabric.Image.filters.Brightness({ brightness: -0.05 }),
      ];

    case 'sunset':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            1.15, 0, 0, 0, 0.06, // dorong merah/oranye
            0, 0.95, 0, 0, 0,    // tekan hijau
            0, 0, 1.0, 0, 0.02,  // sedikit magenta di highlight
            0, 0, 0, 1, 0,
          ],
        }),
        new fabric.Image.filters.Saturation({ saturation: 0.2 }),
      ];

    case 'mint':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            0.92, 0, 0, 0, 0,    // tekan merah
            0, 1.06, 0, 0, 0.02, // dorong hijau
            0, 0, 1.02, 0, 0.02, // sedikit biru → nuansa mint
            0, 0, 0, 1, 0,
          ],
        }),
        new fabric.Image.filters.Brightness({ brightness: 0.04 }),
      ];

    case 'pastel':
      return [
        new fabric.Image.filters.Saturation({ saturation: -0.25 }),
        new fabric.Image.filters.Brightness({ brightness: 0.1 }),
        new fabric.Image.filters.Contrast({ contrast: -0.18 }),
      ];

    case 'blush':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            1.08, 0, 0, 0, 0.05, // kulit lebih hangat kemerahan
            0, 0.96, 0, 0, 0.01,
            0, 0, 1.0, 0, 0.03,
            0, 0, 0, 1, 0,
          ],
        }),
        new fabric.Image.filters.Brightness({ brightness: 0.05 }),
        new fabric.Image.filters.Saturation({ saturation: -0.05 }),
      ];

    case 'moody':
      return [
        new fabric.Image.filters.Saturation({ saturation: -0.3 }),
        new fabric.Image.filters.Contrast({ contrast: 0.22 }),
        new fabric.Image.filters.Brightness({ brightness: -0.06 }),
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            0.95, 0, 0, 0, 0,    // bayangan lebih dingin
            0, 0.98, 0, 0, 0,
            0, 0, 1.06, 0, 0.02,
            0, 0, 0, 1, 0,
          ],
        }),
      ];

    default:
      return [];
  }
};

/**
 * Apply filter to a single Fabric.js image
 */
export const applyFilterToImage = (
  image: FabricImage,
  filterType: FilterType,
): void => {
  const filters = getFiltersByType(filterType);
  image.filters = filters;
  image.applyFilters();
};

/**
 * Apply filter to all photos in composition
 */
export const applyFilterToComposition = (
  canvas: fabric.Canvas,
  filterType: FilterType,
): void => {
  const objects = canvas.getObjects();

  objects.forEach((obj) => {
    if (
      obj.type === 'image' &&
      (obj as FabricImage & { data?: { isPhoto?: boolean } }).data?.isPhoto
    ) {
      applyFilterToImage(obj as FabricImage, filterType);
    }
  });

  canvas.renderAll();
};
