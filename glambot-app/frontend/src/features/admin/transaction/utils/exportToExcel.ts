import * as XLSX from 'xlsx';
import { type Transaction } from '../api/types';
import { TRANSACTION_STATUS_LABEL as STATUS_LABEL } from './status';

export function exportTransactionsToExcel(transactions: Transaction[]) {
  const now = new Date();

  // ── Metadata rows (info di atas tabel) ──────────────────────────────────
  const metaRows = [
    ['GLAMBOT PHOTO BOOTH'],
    ['Transaction Report'],
    [
      `Printed: ${now.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })}`,
    ],
    [`Total Data: ${transactions.length} transaksi`],
    [],
  ];

  // ── Header kolom ────────────────────────────────────────────────────────
  const header = [
    'No',
    'Transaction ID',
    'Order ID (Midtrans)',
    'Package',
    'Frame',
    'Amount (IDR)',
    'Status',
    'Payment Date',
    'Date Created',
  ];

  // ── Baris data ──────────────────────────────────────────────────────────
  const dataRows = transactions.map((t, i) => [
    i + 1,
    t.id,
    t.midtransOrderId || '',
    t.package?.name || '',
    t.frame?.name || '',
    t.amount,
    STATUS_LABEL[t.status] ?? t.status,
    t.paidAt ? new Date(t.paidAt).toLocaleDateString('id-ID') : '',
    new Date(t.createdAt).toLocaleDateString('id-ID'),
  ]);

  // ── Summary row ─────────────────────────────────────────────────────────
  const totalRevenue = transactions
    .filter((t) => t.status === 'success')
    .reduce((s, t) => s + t.amount, 0);

  const summaryRows = [
    [],
    ['', '', '', '', 'Total Revenue (successful):', totalRevenue, '', '', ''],
  ];

  // ── Build worksheet ─────────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(
    [...metaRows, header, ...dataRows, ...summaryRows] as unknown[][],
  );

  // Lebar kolom
  ws['!cols'] = [
    { wch: 5 },   // No
    { wch: 40 },  // Transaction ID
    { wch: 36 },  // Order ID
    { wch: 22 },  // Paket
    { wch: 22 },  // Frame
    { wch: 18 },  // Jumlah
    { wch: 14 },  // Status
    { wch: 16 },  // Tgl Bayar
    { wch: 16 },  // Tgl Dibuat
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `transaction-report-${stamp}.xlsx`);
}
