import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_ACCENT as ACCENT,
  PDF_ACCENT_LIGHT as ACCENT_LIGHT,
  PDF_SUCCESS as SUCCESS,
  PDF_SUCCESS_LIGHT as SUCCESS_LIGHT,
  PDF_DANGER as DANGER,
  drawBrandHeader,
  drawPageFooters,
  formatPdfRupiah as formatRupiah,
  formatReportDate,
  lastTableY,
  loadRobotIcon,
  savePdfWithStamp,
} from '@/lib/pdf';
import { type DashboardSummary } from '../api/types';

const ORDER_STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  cancel: 'Cancelled',
  error: 'Failed',
  pending: 'Pending',
};

function sectionTitle(doc: jsPDF, title: string, y: number, pageW: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.text(title, 14, y);
  doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
  doc.setLineWidth(0.4);
  doc.line(14, y + 1.5, pageW - 14, y + 1.5);
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

export async function exportDashboardToPDF(summary: DashboardSummary) {
  const icon = await loadRobotIcon();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const now = new Date();

  const dateStr = formatReportDate(now);
  const monthStr = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ── Header ──────────────────────────────────────────────────────────────
  drawBrandHeader(doc, {
    pageW,
    bandHeight: 34,
    reportLabel: 'Dashboard Report',
    titleSize: 22,
    bodySize: 9.5,
    titleY: 14,
    subtitleY: 21,
    labelY: 29,
    rightSize: 9,
    rightLines: [
      { text: dateStr, y: 14 },
      { text: `Period: ${monthStr}`, y: 21 },
    ],
    icon,
  });

  // ── KPI Summary ─────────────────────────────────────────────────────────
  let y = sectionTitle(doc, 'KPI Summary', 42, pageW);

  const kpiRows = summary.kpis.map((k) => {
    const pct = Math.round(k.changePct);
    return [k.title, k.value, `${pct >= 0 ? '+' : ''}${pct}%`, k.changeLabel];
  });

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value', 'Change', 'Note']],
    body: kpiRows,
    headStyles: {
      fillColor: [ACCENT[0], ACCENT[1], ACCENT[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [ACCENT_LIGHT[0], ACCENT_LIGHT[1], ACCENT_LIGHT[2]] },
    columnStyles: {
      1: { fontStyle: 'bold', halign: 'right' },
      2: { halign: 'center', fontStyle: 'bold' },
      3: { textColor: [120, 120, 120] },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.column.index === 2 && data.section === 'body') {
        const val = data.cell.raw as string;
        if (val.startsWith('+')) data.cell.styles.textColor = [SUCCESS[0], SUCCESS[1], SUCCESS[2]];
        else if (val.startsWith('-')) data.cell.styles.textColor = [DANGER[0], DANGER[1], DANGER[2]];
      }
    },
  });

  // ── Sales Summary ───────────────────────────────────────────────────────
  const salesStartY = lastTableY(doc) + 10;
  y = sectionTitle(doc, 'Sales Summary', salesStartY, pageW);

  const salesDelta = Math.round(summary.salesReport.delta);
  autoTable(doc, {
    startY: y,
    body: [
      ['Total Revenue This Year', formatRupiah(summary.salesReport.total)],
      [
        'Change vs Last Year',
        `${salesDelta >= 0 ? '+' : ''}${salesDelta}%`,
      ],
    ],
    theme: 'plain',
    bodyStyles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right', fontStyle: 'bold', textColor: [ACCENT[0], ACCENT[1], ACCENT[2]] },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.column.index === 1 && data.section === 'body' && data.row.index === 1) {
        const val = data.cell.raw as string;
        if (val.startsWith('-')) data.cell.styles.textColor = [DANGER[0], DANGER[1], DANGER[2]];
      }
    },
  });

  // ── Top Frames & Top Products (side by side) ─────────────────────────────
  const topStartY = lastTableY(doc) + 10;
  y = sectionTitle(doc, 'Top Frames & Products', topStartY, pageW);

  const midX = pageW / 2 + 3;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Frame Name', 'Usage']],
    body:
      summary.topFrames.length > 0
        ? summary.topFrames.map((f, i) => [i + 1, f.name || '-', f.used])
        : [['—', 'No data yet', '']],
    headStyles: {
      fillColor: [ACCENT[0], ACCENT[1], ACCENT[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [ACCENT_LIGHT[0], ACCENT_LIGHT[1], ACCENT_LIGHT[2]] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { halign: 'center' },
    },
    margin: { left: 14, right: midX },
    styles: { overflow: 'ellipsize' },
  });
  const leftFinalY = lastTableY(doc);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Product Name', 'Sold']],
    body:
      summary.topProducts.length > 0
        ? summary.topProducts.map((p, i) => [i + 1, p.name || '-', p.used])
        : [['—', 'No data yet', '']],
    headStyles: {
      fillColor: [SUCCESS[0], SUCCESS[1], SUCCESS[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [SUCCESS_LIGHT[0], SUCCESS_LIGHT[1], SUCCESS_LIGHT[2]] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { halign: 'center' },
    },
    margin: { left: midX, right: 14 },
    styles: { overflow: 'ellipsize' },
  });
  const rightFinalY = lastTableY(doc);

  // ── Recent Orders ────────────────────────────────────────────────────────
  const recentStartY = Math.max(leftFinalY, rightFinalY) + 10;
  y = sectionTitle(doc, 'Recent Transactions', recentStartY, pageW);

  autoTable(doc, {
    startY: y,
    head: [['Transaction ID', 'Package', 'Amount', 'Date', 'Status']],
    body:
      summary.recentOrders.length > 0
        ? summary.recentOrders.map((o) => [
            o.id.length > 22 ? o.id.slice(0, 20) + '…' : o.id,
            o.package || '-',
            formatRupiah(o.amount),
            o.date,
            ORDER_STATUS_LABEL[o.status] ?? o.status,
          ])
        : [['—', 'No data yet', '', '', '']],
    headStyles: {
      fillColor: [ACCENT[0], ACCENT[1], ACCENT[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: [ACCENT_LIGHT[0], ACCENT_LIGHT[1], ACCENT_LIGHT[2]] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'center' },
      4: { halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.column.index === 4 && data.section === 'body') {
        const v = data.cell.raw as string;
        if (v === 'Completed') data.cell.styles.textColor = [SUCCESS[0], SUCCESS[1], SUCCESS[2]];
        else if (v === 'Failed' || v === 'Cancelled') data.cell.styles.textColor = [DANGER[0], DANGER[1], DANGER[2]];
      }
    },
  });

  // ── Page footer ──────────────────────────────────────────────────────────
  drawPageFooters(doc, dateStr, { pageW, pageH, bottomOffset: 8, icon });

  savePdfWithStamp(doc, 'dashboard-report', now);
}
