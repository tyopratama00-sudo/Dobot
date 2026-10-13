import type jsPDF from 'jspdf';
import { formatIDR } from './formats';

// Bagian yang dipakai bersama laporan PDF admin (dashboard & transaksi):
// palet, mark robot, header brand, footer, dan penamaan file. Angka layout
// tetap dikirim pemanggil supaya tiap laporan bebas mengatur tata letaknya.
//
// Palet mengikuti brand yang dipakai produk — navy/biru kiosk (public.css) yang
// juga senada dengan livery robot (badan putih, aksen biru). Ungu yang dipakai
// versi sebelumnya tidak muncul di UI mana pun.

/** #112D4E — pita header & teks tegas. */
export const PDF_BRAND = [17, 45, 78] as const;
/** #3F72AF — judul seksi, kepala tabel, aksen robot. */
export const PDF_ACCENT = [63, 114, 175] as const;
/** Baris selang-seling tabel; lebih terang dari #DBE2EF agar teks tetap kontras. */
export const PDF_ACCENT_LIGHT = [237, 242, 248] as const;
export const PDF_SUCCESS = [15, 138, 92] as const;
export const PDF_SUCCESS_LIGHT = [235, 246, 241] as const;
export const PDF_DANGER = [192, 57, 43] as const;
export const PDF_MUTED = [120, 132, 148] as const;

export type PdfColor = readonly [number, number, number];

// jspdf-autotable menempelkan lastAutoTable ke instance doc tanpa deklarasi tipe.
type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

/** Posisi Y akhir tabel terakhir; `fallback` dipakai kalau belum ada tabel. */
export const lastTableY = (doc: jsPDF, fallback = 200): number =>
  (doc as AutoTableDoc).lastAutoTable?.finalY ?? fallback;

/** Nominal rupiah untuk isi tabel PDF — sumber sama dengan tampilan di UI. */
export const formatPdfRupiah = formatIDR;

/** Tanggal panjang gaya laporan, mis. "28 July 2026". */
export const formatReportDate = (now: Date): string =>
  now.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

/**
 * Mark lengan robot — vektor, bukan gambar, supaya tetap tajam di cetakan dan
 * tidak menambah berat file. Siluetnya mengikuti Nova 5 yang dipakai booth:
 * kaki, kolom dengan cincin biru di sambungan base, siku, lengan naik, lalu
 * kepala kamera berlensa. Digambar di kotak nominal 15 × 15,4 mm lalu diskalakan.
 */
export function drawRobotMark(
  doc: jsPDF,
  o: { x: number; y: number; size: number; body: PdfColor; accent: PdfColor },
): void {
  const k = o.size / NOMINAL_MARK_H;
  const X = (v: number) => o.x + v * k;
  const Y = (v: number) => o.y + v * k;
  const S = (v: number) => v * k;

  const body = () => doc.setFillColor(o.body[0], o.body[1], o.body[2]);
  const accent = () => doc.setFillColor(o.accent[0], o.accent[1], o.accent[2]);

  body();
  doc.roundedRect(X(1.8), Y(13.4), S(9.0), S(2.0), S(0.9), S(0.9), 'F'); // kaki
  doc.roundedRect(X(4.1), Y(8.6), S(4.4), S(5.2), S(1.2), S(1.2), 'F'); // kolom bawah
  doc.roundedRect(X(4.1), Y(3.4), S(4.4), S(5.6), S(1.4), S(1.4), 'F'); // kolom atas
  doc.roundedRect(X(4.1), Y(2.2), S(8.8), S(3.4), S(1.4), S(1.4), 'F'); // lengan
  doc.roundedRect(X(10.4), Y(0.2), S(4.6), S(3.2), S(0.6), S(0.6), 'F'); // kepala kamera

  accent();
  doc.roundedRect(X(4.1), Y(12.4), S(4.4), S(1.1), S(0.45), S(0.45), 'F'); // cincin base
  doc.rect(X(4.1), Y(8.1), S(4.4), S(1.0), 'F'); // cincin siku
  doc.circle(X(12.7), Y(1.8), S(0.95), 'F'); // lensa
}

/** Tinggi kotak nominal mark (mm) — dasar penskalaan drawRobotMark. */
const NOMINAL_MARK_H = 15.4;
/** Lebar mark relatif tingginya, untuk menghitung ruang teks di sebelahnya. */
export const ROBOT_MARK_ASPECT = 15 / NOMINAL_MARK_H;

/** Ikon robot milik aplikasi — sumber yang sama dengan yang dipakai UI. */
const ROBOT_ICON_URL = '/robot 1.svg';

/**
 * Rasterisasi ikon robot aplikasi jadi PNG data URL supaya bisa ditempel ke
 * PDF (jsPDF tidak bisa menggambar SVG langsung). Dibaca dari aset yang sama
 * dengan yang dipakai UI, jadi tidak ada salinan yang bisa basi, dan tidak ada
 * base64 besar yang ikut ke bundle.
 *
 * Return null di luar browser atau kalau aset gagal dimuat — pemanggil jatuh ke
 * drawRobotMark (vektor) supaya laporan tetap terbit apa adanya.
 */
export async function loadRobotIcon(px = 256): Promise<string | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('gagal memuat ikon robot'));
    });
    img.src = encodeURI(ROBOT_ICON_URL);
    await loaded;

    const canvas = document.createElement('canvas');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, px, px);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

interface BrandHeaderOptions {
  pageW: number;
  /** Tinggi pita brand di atas halaman. */
  bandHeight: number;
  /** Label laporan di bawah "PHOTO BOOTH". */
  reportLabel: string;
  titleSize: number;
  bodySize: number;
  titleY: number;
  subtitleY: number;
  labelY: number;
  /** Teks rata kanan (tanggal, jumlah data, info filter). */
  rightLines?: { text: string; y: number }[];
  rightSize?: number;
  /** PNG data URL ikon robot (loadRobotIcon). Null → pakai mark vektor. */
  icon?: string | null;
}

/**
 * Pita header: mark robot + "GLAMBOT / PHOTO BOOTH / <label>" + blok teks kanan.
 * Mark ditempatkan di margin kiri dan blok teks bergeser ke kanannya.
 */
export function drawBrandHeader(doc: jsPDF, o: BrandHeaderOptions): void {
  doc.setFillColor(PDF_BRAND[0], PDF_BRAND[1], PDF_BRAND[2]);
  doc.rect(0, 0, o.pageW, o.bandHeight, 'F');

  // Mark/ikon mengisi pita dengan sisa napas 5 mm atas-bawah.
  const markSize = o.bandHeight - 10;
  let markWidth = markSize * ROBOT_MARK_ASPECT;

  if (o.icon) {
    // Ikon aplikasi bergradien navy→biru, jadi butuh alas terang supaya kontras
    // di atas pita brand — dibuat seperti app badge.
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(14, 5, markSize, markSize, 2.4, 2.4, 'F');
    const pad = markSize * 0.12;
    doc.addImage(
      o.icon,
      'PNG',
      14 + pad,
      5 + pad,
      markSize - pad * 2,
      markSize - pad * 2,
    );
    markWidth = markSize;
  } else {
    drawRobotMark(doc, {
      x: 14,
      y: 5,
      size: markSize,
      body: [255, 255, 255],
      accent: PDF_ACCENT,
    });
  }
  const textX = 14 + markWidth + 6;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(o.titleSize);
  doc.text('GLAMBOT', textX, o.titleY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(o.bodySize);
  doc.text('PHOTO BOOTH', textX, o.subtitleY);
  doc.text(o.reportLabel, textX, o.labelY);

  if (o.rightLines?.length) {
    doc.setFontSize(o.rightSize ?? o.bodySize);
    for (const line of o.rightLines) {
      doc.text(line.text, o.pageW - 14, line.y, { align: 'right' });
    }
  }

  doc.setTextColor(0, 0, 0);
}

/**
 * Footer tiap halaman: mark robot mungil di margin kiri + "Page x of y ·
 * GLAMBOT Photo Booth · <tanggal>" di tengah.
 */
export function drawPageFooters(
  doc: jsPDF,
  dateStr: string,
  opts: {
    pageW: number;
    pageH: number;
    bottomOffset: number;
    /** PNG data URL ikon robot. Null → mark vektor. */
    icon?: string | null;
  },
): void {
  const pageCount = doc.getNumberOfPages();
  const markSize = 5;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Dasar mark/ikon disejajarkan dengan baseline teks footer.
    const markY = opts.pageH - opts.bottomOffset - markSize + 1;
    if (opts.icon) {
      doc.addImage(opts.icon, 'PNG', 14, markY, markSize, markSize);
    } else {
      drawRobotMark(doc, {
        x: 14,
        y: markY,
        size: markSize,
        body: PDF_MUTED,
        accent: PDF_ACCENT,
      });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(PDF_MUTED[0], PDF_MUTED[1], PDF_MUTED[2]);
    doc.text(
      `Page ${i} of ${pageCount}  ·  GLAMBOT Photo Booth  ·  ${dateStr}`,
      opts.pageW / 2,
      opts.pageH - opts.bottomOffset,
      { align: 'center' },
    );
  }
}

/** Simpan sebagai `<prefix>-YYYYMMDD.pdf`. */
export function savePdfWithStamp(doc: jsPDF, prefix: string, now: Date): void {
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  doc.save(`${prefix}-${stamp}.pdf`);
}
