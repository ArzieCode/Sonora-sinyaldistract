import { jsPDF } from 'jspdf';
import { ProcessingRunRecord } from '../types/sonora';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportHistoryToCsv(records: ProcessingRunRecord[]): void {
  const headers = [
    'Run ID',
    'Timestamp',
    'Audio Filename',
    'Reference Filename',
    'Filter Architecture',
    'Filter Type',
    'Cutoff',
    'Order',
    'Sample Rate (Hz)',
    'Processing Time (ms)',
    'SNR (dB)',
    'SNR Delta (dB)',
    'MSE',
    'RMSE',
    'Status',
    'Data Origin',
  ];

  const escapeCsv = (val: string | number | null) => {
    const str = val === null ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = records.map((r) => [
    r.id,
    r.timestamp,
    r.audioFilename,
    r.referenceFilename ?? 'None',
    r.filterArchitecture,
    r.filterType,
    r.cutoffLabel,
    r.order,
    r.sampleRate,
    r.processingDurationMs.toFixed(2),
    r.snrDb !== null ? r.snrDb.toFixed(3) : 'N/A - Reference Required',
    r.snrImprovementDb !== null ? r.snrImprovementDb.toFixed(3) : 'N/A - Reference Required',
    r.mse !== null ? r.mse.toExponential(4) : 'N/A - Reference Required',
    r.rmse !== null ? r.rmse.toFixed(5) : 'N/A - Reference Required',
    r.status,
    r.isDemoData ? 'Demonstration Seed' : 'Live Browser DSP',
  ]);

  const csv = [headers.join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'sonora_processing_history.csv');
}

export function exportHistoryToJson(records: ProcessingRunRecord[]): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    platform: 'SONORA DSP Laboratory',
    note: 'Metrics marked null indicate no aligned clean reference signal was supplied.',
    records,
  };
  triggerDownload(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    'sonora_processing_history.json'
  );
}

export function exportHistoryToPdf(records: ProcessingRunRecord[]): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(16, 21, 34);
  doc.rect(0, 0, pageWidth, 72, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SONORA — Digital Signal Processing Laboratory Report', 36, 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated: ${new Date().toISOString()}  |  Total Runs: ${records.length}  |  SNR/MSE/RMSE require aligned clean reference`,
    36,
    54
  );

  let y = 104;
  const cols = [
    { label: 'Run ID', x: 36 },
    { label: 'Audio File', x: 118 },
    { label: 'Filter', x: 290 },
    { label: 'Cutoff', x: 380 },
    { label: 'Order', x: 462 },
    { label: 'Fs (Hz)', x: 508 },
    { label: 'SNR (dB)', x: 564 },
    { label: 'MSE', x: 632 },
    { label: 'RMSE', x: 706 },
    { label: 'Status', x: 768 },
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  cols.forEach((c) => doc.text(c.label, c.x, y));

  doc.setDrawColor(203, 213, 225);
  doc.line(36, y + 6, pageWidth - 36, y + 6);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  records.forEach((r) => {
    if (y > 540) {
      doc.addPage();
      y = 48;
    }
    const truncate = (s: string, len: number) => (s.length > len ? s.slice(0, len - 1) + '…' : s);

    doc.text(r.id, 36, y);
    doc.text(truncate(r.audioFilename, 30), 118, y);
    doc.text(`${r.filterArchitecture} ${r.filterType}`, 290, y);
    doc.text(truncate(r.cutoffLabel, 14), 380, y);
    doc.text(String(r.order), 462, y);
    doc.text(String(r.sampleRate), 508, y);
    doc.text(r.snrDb !== null ? r.snrDb.toFixed(2) : 'N/A (No Ref)', 564, y);
    doc.text(r.mse !== null ? r.mse.toExponential(2) : 'N/A (No Ref)', 632, y);
    doc.text(r.rmse !== null ? r.rmse.toFixed(4) : 'N/A (No Ref)', 706, y);
    doc.text(r.status, 768, y);

    y += 18;
  });

  doc.save('sonora_dsp_report.pdf');
}
