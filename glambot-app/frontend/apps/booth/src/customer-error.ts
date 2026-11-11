import { ApiError, NetworkError } from './api/client';

/**
 * Turns technical errors into words a customer understands. The raw text stays
 * in logs / PrintJob.error for staff; the customer only sees these messages
 * and a short code to read out to staff (e.g. "PRINT-01").
 */

export const CALL_STAFF = 'Silakan hubungi petugas, ya.';
export const GENERIC = `Terjadi kendala. Coba lagi, ya. Jika masih gagal, ${CALL_STAFF.toLowerCase()}`;
export const OFFLINE = 'Koneksi ke sistem terputus sebentar. Mohon tunggu, ya.';

/** Message for a failed customer action; `fallback` fits the context (payment, start, …). */
export function customerMessage(e: unknown, fallback = GENERIC): string {
  if (e instanceof NetworkError) return OFFLINE;
  if (e instanceof ApiError && e.userMessage) return e.userMessage;
  return fallback;
}

/** Backend messages written for the customer (form validation, expired session); the rest are technical. */
export const customerFacingStatus = (status: number) => status === 400 || status === 410 || status === 422;

export interface CustomerProblem {
  code: string;
  message: string;
}

/** Print failure from the raw backend/printer error. */
export function printProblem(raw: string | null | undefined): CustomerProblem {
  const r = (raw ?? '').toLowerCase();
  if (/tidak ada printer|no printer|printer not found/.test(r)) return { code: 'PRINT-01', message: 'Printer belum tersambung.' };
  if (/belum siap|offline|paused|error|paper|kertas|tinta|ink/.test(r) && /printer/.test(r)) return { code: 'PRINT-02', message: 'Printer sedang tidak siap.' };
  if (/http|timeout|timed out|failed to fetch|network|abort/.test(r)) return { code: 'PRINT-03', message: 'Printer tidak merespons.' };
  return { code: 'PRINT-00', message: 'Printer sedang bermasalah.' };
}

/** Saving the finished frame failed (compose/upload). */
export const SAVE_PROBLEM: CustomerProblem = { code: 'SIMPAN-01', message: `Fotomu belum berhasil disimpan. ${CALL_STAFF}` };

/** Robot/camera took no photos. */
export const NO_PHOTOS_PROBLEM: CustomerProblem = { code: 'FOTO-01', message: `Maaf, foto gagal diambil. ${CALL_STAFF}` };

/** Screen crashed (render error). */
export const APP_PROBLEM: CustomerProblem = { code: 'APP-01', message: `Layar mengalami kendala dan akan dimuat ulang. ${CALL_STAFF}` };
