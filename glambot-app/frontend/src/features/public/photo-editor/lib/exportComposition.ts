import { fabric } from 'fabric';

export interface ExportOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
  multiplier?: number; // Resolution multiplier
}

export interface ExportResult {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  fileSize: number;
}

/**
 * Convert data URL to Blob
 */
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

/**
 * Export Fabric.js canvas to high-resolution image
 */
export const exportComposition = async (
  canvas: fabric.Canvas,
  options: ExportOptions = {},
): Promise<ExportResult> => {
  const {
    format = 'jpeg',
    quality = 0.95,
    multiplier = 3, // 3x = ~300 DPI for typical print
  } = options;

  // Buang selection aktif supaya tidak ada sisa state seleksi saat render
  // (foto adjust pakai selectable:true). Border/handle bawaan memang sudah
  // dimatikan, tapi ini menjamin export bersih.
  canvas.discardActiveObject();
  canvas.renderAll();

  // Export to data URL
  const dataUrl = canvas.toDataURL({
    format,
    quality,
    multiplier,
  });

  // Convert to Blob
  const blob = await dataUrlToBlob(dataUrl);

  // Get dimensions
  const width = canvas.width! * multiplier;
  const height = canvas.height! * multiplier;

  return {
    dataUrl,
    blob,
    width,
    height,
    fileSize: blob.size,
  };
};
