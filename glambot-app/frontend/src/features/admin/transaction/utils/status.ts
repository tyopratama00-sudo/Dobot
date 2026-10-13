import { type TransactionStatus } from '../api/types';

/**
 * Label & warna badge per status transaksi. Sumber tunggal untuk tabel, panel
 * detail, dan kedua exporter — sebelumnya map ini disalin di empat file dan
 * bisa berbeda diam-diam saat salah satunya diubah.
 */
export const TRANSACTION_STATUS_CONFIG: Record<
  TransactionStatus,
  { label: string; className: string }
> = {
  success: {
    label: 'Success',
    className: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100/80',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100/80',
  },
  failed: {
    label: 'Failed',
    className: 'bg-rose-100 text-rose-800 hover:bg-rose-100/80',
  },
  expired: {
    label: 'Expired',
    className: 'bg-slate-100 text-slate-800 hover:bg-slate-100/80',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-800 hover:bg-slate-100/80',
  },
};

/** Label saja — dipakai export Excel/PDF yang tidak butuh kelas warna. */
export const TRANSACTION_STATUS_LABEL: Record<string, string> =
  Object.fromEntries(
    Object.entries(TRANSACTION_STATUS_CONFIG).map(([key, cfg]) => [
      key,
      cfg.label,
    ]),
  );
