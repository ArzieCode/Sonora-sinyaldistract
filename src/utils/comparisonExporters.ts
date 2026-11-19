import { MethodComparisonResult } from '../dsp/blockProcessor';
import { DataScenario } from '../dsp/scenarios';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatRealtimeStatusLabel(
  status: MethodComparisonResult['realtimeStatus']
): 'OFFLINE' | 'REAL-TIME' | 'NOT REAL-TIME' {
  if (status === 'TIDAK REAL-TIME') return 'NOT REAL-TIME';
  return status;
}

export function exportComparisonMetricsCsv(
  results: MethodComparisonResult[],
  audioName: string,
  scenario: DataScenario,
  blockSize: number
): void {
  const headers = [
    'Dataset',
    'Scenario',
    'Block Size (samples)',
    'Method',
    'Input SNR (dB)',
    'Output SNR (dB)',
    'SNR Improvement (dB)',
    'SNR Basis',
    'MSE',
    'RMSE',
    'Block Latency (ms)',
    'Computation Time (ms)',
    'Status',
  ];

  const rows = results.map((r) => [
    audioName,
    `Scenario ${scenario}`,
    blockSize,
    r.methodLabel,
    r.inputSnrDb !== null ? r.inputSnrDb.toFixed(3) : 'Not Available',
    r.outputSnrDb !== null ? r.outputSnrDb.toFixed(3) : 'Not Available',
    r.snrImprovementDb !== null ? r.snrImprovementDb.toFixed(3) : 'Not Available',
    r.snrIsEstimate ? 'Estimated' : 'Clean Reference',
    r.mse !== null ? r.mse.toExponential(5) : 'Not Available',
    r.rmse !== null ? r.rmse.toFixed(6) : 'Not Available',
    r.blockLatencyMs.toFixed(3),
    r.computePerBlockMs.toFixed(3),
    formatRealtimeStatusLabel(r.realtimeStatus),
  ]);

  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [headers.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    'sonora_evaluation_metrics.csv'
  );
}

export function exportComparisonMetricsJson(
  results: MethodComparisonResult[],
  audioName: string,
  scenario: DataScenario,
  blockSize: number
): void {
  const payload = {
    instrument: 'SONORA Digital Signal Processing Lab',
    exportedAt: new Date().toISOString(),
    dataset: audioName,
    scenario: `Scenario ${scenario}`,
    blockSizeSamples: blockSize,
    metrics: results.map((r) => ({
      method: r.methodLabel,
      inputSnrDb: r.inputSnrDb,
      outputSnrDb: r.outputSnrDb,
      snrImprovementDb: r.snrImprovementDb,
      snrType: r.snrIsEstimate ? 'Estimated' : 'Clean Reference',
      mse: r.mse !== null ? r.mse : 'Not Available',
      rmse: r.rmse !== null ? r.rmse : 'Not Available',
      blockLatencyMs: r.blockLatencyMs,
      computationTimeMs: r.computePerBlockMs,
      status: formatRealtimeStatusLabel(r.realtimeStatus),
    })),
  };

  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    'sonora_evaluation_metrics.json'
  );
}
