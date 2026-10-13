import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_ACCENT as ACCENT,
  PDF_ACCENT_LIGHT as ACCENT_LIGHT,
  PDF_SUCCESS as SUCCESS,
  PDF_DANGER as DANGER,
  drawBrandHeader,
  drawPageFooters,
  formatPdfRupiah as formatRupiah,
  formatReportDate,
  lastTableY,
  loadRobotIcon,
  savePdfWithStamp,
} from '@/lib/pdf';
import { type Transaction } from '../api/types';

import { TRANSACTION_STATUS_LABEL as STATUS_LABEL } from './status';

export async function exportTransactionsToPDF(
  transactions: Transaction[],
  filters?: { status?: string; search?: string },
) {
  const icon = await loadRobotIcon();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const now = new Date();

  // ── Header ──────────────────────────────────────────────────────────────
  const dateStr = formatReportDate(now);

  const filterInfo: string[] = [];
  if (filters?.status && filters.status !== 'all') {
    filterInfo.push(`Status: ${STATUS_LABEL[filters.status] ?? filters.status}`);
  }
  if (filters?.search) filterInfo.push(`Search: "${filters.search}"`);

  const rightLines = [
    { text: `Printed: ${dateStr}`, y: 14 },
    { text: `Total Data: ${transactions.length} transactions`, y: 21 },
  ];
  if (filterInfo.length) {
    rightLines.push({ text: `Filter — ${filterInfo.join('  ·  ')}`, y: 28 });
  }

  drawBrandHeader(doc, {
    pageW,
    bandHeight: 32,
    reportLabel: 'Transaction Report',
    titleSize: 20,
    bodySize: 9,
    titleY: 13,
    subtitleY: 20,
    labelY: 27,
    rightSize: 8.5,
    rightLines,
    icon,
  });

  // ── Table ────────────────────────────────────────────────────────────────
  const rows = transactions.map((t, i) => [
    i + 1,
    t.id.length > 22 ? t.id.slice(0, 20) + '…' : t.id,
    t.midtransOrderId || '-',
    t.package?.name || '-',
    t.frame?.name || '-',
    formatRupiah(t.amount),
    STATUS_LABEL[t.status] ?? t.status,
    t.paidAt ? new Date(t.paidAt).toLocaleDateString('id-ID') : '-',
    new Date(t.createdAt).toLocaleDateString('id-ID'),
  ]);

  autoTable(doc, {
    startY: 38,
    head: [['No', 'Transaction ID', 'Order ID', 'Package', 'Frame', 'Amount', 'Status', 'Paid', 'Created']],
    body: rows,
    headStyles: {
      fillColor: [ACCENT[0], ACCENT[1], ACCENT[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 2 },
    alternateRowStyles: { fillColor: [ACCENT_LIGHT[0], ACCENT_LIGHT[1], ACCENT_LIGHT[2]] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'center' },
      7: { halign: 'center' },
      8: { halign: 'center' },
    },
    margin: { left: 14, right: 14, bottom: 18 },
    styles: { overflow: 'ellipsize' },
    didParseCell: (data) => {
      if (data.column.index === 6 && data.section === 'body') {
        const v = data.cell.raw as string;
        if (v === 'Success') data.cell.styles.textColor = [SUCCESS[0], SUCCESS[1], SUCCESS[2]];
        else if (v === 'Failed' || v === 'Expired') data.cell.styles.textColor = [DANGER[0], DANGER[1], DANGER[2]];
      }
    },
  });

  // ── Revenue summary box ───────────────────────────────────────────────────
  const finalY = lastTableY(doc);
  const totalRevenue = transactions
    .filter((t) => t.status === 'success')
    .reduce((s, t) => s + t.amount, 0);

  if (finalY + 16 < pageH - 18) {
    doc.setFillColor(ACCENT_LIGHT[0], ACCENT_LIGHT[1], ACCENT_LIGHT[2]);
    doc.roundedRect(14, finalY + 5, pageW - 28, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text('Total Revenue (successful):', 20, finalY + 12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(formatRupiah(totalRevenue), pageW - 20, finalY + 12, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  // ── Page footer ──────────────────────────────────────────────────────────
  drawPageFooters(doc, dateStr, { pageW, pageH, bottomOffset: 6, icon });

  savePdfWithStamp(doc, 'transaction-report', now);
}
