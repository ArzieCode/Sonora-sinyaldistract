import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { AudioPlayerBar } from './AudioPlayerBar';
import { MethodComparisonResult } from '../dsp/blockProcessor';
import { DataScenario } from '../dsp/scenarios';
import { AudioSignalData, FilterConfig, LabPreferences } from '../types/sonora';
import {
  exportComparisonMetricsCsv,
  exportComparisonMetricsJson,
  formatRealtimeStatusLabel,
} from '../utils/comparisonExporters';

interface EvaluationAndOutputSectionProps {
  noisyAudio: AudioSignalData | null;
  referenceAudio: AudioSignalData | null;
  results: MethodComparisonResult[];
  scenario: DataScenario;
  blockSize: number;
  firConfig: FilterConfig;
  iirConfig: FilterConfig;
  preferences: LabPreferences;
  onPlaybackProgress: (timeSec: number | null) => void;
  showTable?: boolean;
  showPlayers?: boolean;
  showExports?: boolean;
}

type PlaybackSourceKey = 'noisy' | 'fir' | 'iir' | 'spectral' | 'reference';

export const EvaluationAndOutputSection: React.FC<EvaluationAndOutputSectionProps> = ({
  noisyAudio,
  referenceAudio,
  results,
  scenario,
  blockSize,
  firConfig,
  iirConfig,
  preferences,
  onPlaybackProgress,
  showTable = true,
  showPlayers = true,
  showExports = true,
}) => {
  const [selectedSource, setSelectedSource] = useState<PlaybackSourceKey>('noisy');
  const [exportConfirmation, setExportConfirmation] = useState<string | null>(null);

  const isEstimate = scenario === 'B';
  const precision = preferences.numericalPrecision;

  const firResult = results.find((r) => r.methodId === 'fir') ?? null;
  const iirResult = results.find((r) => r.methodId === 'iir') ?? null;
  const spectralResult = results.find((r) => r.methodId === 'spectral') ?? null;

  const activePlayerMeta = (() => {
    if (selectedSource === 'fir' && firResult) {
      return {
        src: firResult.outputAudio.blobUrl,
        label: 'FIR Filter Output',
        tag: 'FIR',
        downloadFilename: firResult.outputAudio.name,
      };
    }
    if (selectedSource === 'iir' && iirResult) {
      return {
        src: iirResult.outputAudio.blobUrl,
        label: 'IIR Butterworth Output',
        tag: 'IIR',
        downloadFilename: iirResult.outputAudio.name,
      };
    }
    if (selectedSource === 'spectral' && spectralResult) {
      return {
        src: spectralResult.outputAudio.blobUrl,
        label: 'Spectral Subtraction Output',
        tag: 'SPECTRAL',
        downloadFilename: spectralResult.outputAudio.name,
      };
    }
    if (selectedSource === 'reference' && referenceAudio) {
      return {
        src: referenceAudio.blobUrl,
        label: 'Clean Reference Audio',
        tag: 'REFERENCE',
        downloadFilename: referenceAudio.name,
      };
    }
    if (noisyAudio) {
      return {
        src: noisyAudio.blobUrl,
        label: 'Original Noisy Audio',
        tag: 'NOISY',
        downloadFilename: noisyAudio.name,
      };
    }
    return null;
  })();

  const confirmExport = (msg: string) => {
    setExportConfirmation(msg);
    setTimeout(() => setExportConfirmation(null), 4000);
  };

  return (
    <div className="space-y-4">
      {/* QUANTITATIVE EVALUATION TABLE */}
      {showTable && (
        <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Quantitative Evaluation
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {scenario === 'B'
                  ? 'Scenario B (No clean reference): MSE and RMSE are Not Available; SNR values are Estimated.'
                  : scenario === 'C'
                    ? 'Scenario C (Aligned recordings): MSE and RMSE are comparative indicators only.'
                    : 'Scenario A (Clean reference available): Exact SNR, MSE, and RMSE evaluated against clean reference.'}
              </p>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              Block Size: {blockSize} samples
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg)]/70 text-[var(--text-secondary)]">
                  <th className="px-2.5 py-2 font-semibold">Method</th>
                  <th className="px-2.5 py-2 text-right font-semibold">
                    Input SNR {isEstimate ? '(Estimated)' : '(dB)'}
                  </th>
                  <th className="px-2.5 py-2 text-right font-semibold">
                    Output SNR {isEstimate ? '(Estimated)' : '(dB)'}
                  </th>
                  <th className="px-2.5 py-2 text-right font-semibold">SNR Improvement (dB)</th>
                  <th className="px-2.5 py-2 text-right font-semibold">MSE</th>
                  <th className="px-2.5 py-2 text-right font-semibold">RMSE</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Block Latency (ms)</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Computation Time (ms)</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                {results.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center font-sans text-[12px] text-[var(--text-secondary)]"
                    >
                      Run comparison to populate quantitative metrics for FIR, IIR Butterworth, and Spectral Subtraction.
                    </td>
                  </tr>
                ) : (
                  results.map((r) => {
                    const statusText = formatRealtimeStatusLabel(r.realtimeStatus);
                    const methodShort =
                      r.methodId === 'fir'
                        ? 'FIR Filter'
                        : r.methodId === 'iir'
                          ? 'IIR Butterworth'
                          : 'Spectral Subtraction';

                    return (
                      <tr key={r.methodId} className="hover:bg-[var(--bg)]/50">
                        <td className="px-2.5 py-2 font-sans font-medium text-[var(--text-primary)]">
                          {methodShort}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          {r.inputSnrDb !== null ? (
                            <span>
                              {r.inputSnrDb.toFixed(precision)}
                              {r.snrIsEstimate ? ' (Est.)' : ''}
                            </span>
                          ) : (
                            <span className="font-sans text-[var(--text-secondary)]">
                              Not Available
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right font-semibold text-[var(--signal-denoised)]">
                          {r.outputSnrDb !== null ? (
                            <span>
                              {r.outputSnrDb.toFixed(precision)}
                              {r.snrIsEstimate ? ' (Est.)' : ''}
                            </span>
                          ) : (
                            <span className="font-sans font-normal text-[var(--text-secondary)]">
                              Not Available
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          {r.snrImprovementDb !== null ? (
                            <span>
                              {r.snrImprovementDb >= 0 ? '+' : ''}
                              {r.snrImprovementDb.toFixed(precision)}
                            </span>
                          ) : (
                            <span className="font-sans text-[var(--text-secondary)]">
                              Not Available
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          {r.mse !== null ? (
                            r.mse.toExponential(precision)
                          ) : (
                            <span className="font-sans text-[var(--text-secondary)]">
                              Not Available
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          {r.rmse !== null ? (
                            r.rmse.toFixed(precision + 1)
                          ) : (
                            <span className="font-sans text-[var(--text-secondary)]">
                              Not Available
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-2 text-right">{r.blockLatencyMs.toFixed(2)}</td>
                        <td className="px-2.5 py-2 text-right">
                          {r.computePerBlockMs.toFixed(3)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-semibold">
                          <span
                            className={
                              statusText === 'REAL-TIME'
                                ? 'text-[var(--success)]'
                                : statusText === 'NOT REAL-TIME'
                                  ? 'text-[var(--error)]'
                                  : 'text-[var(--text-secondary)]'
                            }
                          >
                            {statusText}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* AUDIO OUTPUT & EXPORT / REPORTS */}
      {(showPlayers || showExports) && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {showPlayers && (
            <section
              className={`rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4 ${
                showExports ? 'xl:col-span-7' : 'xl:col-span-12'
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Audio Output · Comparison Player
                  </h2>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    Select any processed or source signal for synchronized waveform playback.
                  </p>
                </div>
              </div>

              {/* Selectable Source Tabs */}
              <div className="mb-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!noisyAudio}
                  onClick={() => setSelectedSource('noisy')}
                  className={`rounded-[2px] border px-2.5 py-1 text-[11.5px] font-medium disabled:opacity-40 ${
                    selectedSource === 'noisy'
                      ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.08] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  Original Noisy
                </button>
                <button
                  type="button"
                  disabled={!firResult}
                  onClick={() => setSelectedSource('fir')}
                  className={`rounded-[2px] border px-2.5 py-1 text-[11.5px] font-medium disabled:opacity-40 ${
                    selectedSource === 'fir'
                      ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.08] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  FIR Output
                </button>
                <button
                  type="button"
                  disabled={!iirResult}
                  onClick={() => setSelectedSource('iir')}
                  className={`rounded-[2px] border px-2.5 py-1 text-[11.5px] font-medium disabled:opacity-40 ${
                    selectedSource === 'iir'
                      ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.08] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  IIR Output
                </button>
                <button
                  type="button"
                  disabled={!spectralResult}
                  onClick={() => setSelectedSource('spectral')}
                  className={`rounded-[2px] border px-2.5 py-1 text-[11.5px] font-medium disabled:opacity-40 ${
                    selectedSource === 'spectral'
                      ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.08] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                  }`}
                >
                  Spectral Subtraction
                </button>
                {referenceAudio && (
                  <button
                    type="button"
                    onClick={() => setSelectedSource('reference')}
                    className={`rounded-[2px] border px-2.5 py-1 text-[11.5px] font-medium ${
                      selectedSource === 'reference'
                        ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.08] text-[var(--text-primary)]'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]'
                    }`}
                  >
                    Clean Reference
                  </button>
                )}
              </div>

              {activePlayerMeta ? (
                <AudioPlayerBar
                  src={activePlayerMeta.src}
                  label={activePlayerMeta.label}
                  tag={activePlayerMeta.tag}
                  downloadFilename={activePlayerMeta.downloadFilename}
                  onPlaybackProgress={onPlaybackProgress}
                />
              ) : (
                <div className="flex h-20 items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12px] text-[var(--text-secondary)]">
                  Load or record audio to enable playback comparison.
                </div>
              )}
            </section>
          )}

          {showExports && (
            <section
              className={`rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4 ${
                showPlayers ? 'xl:col-span-5' : 'xl:col-span-12'
              }`}
            >
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Export and Reports
              </h2>
              <p className="mb-3 text-[12px] text-[var(--text-secondary)]">
                Export quantitative evaluation tables and processed WAV audio files.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={results.length === 0 || !noisyAudio}
                  onClick={() => {
                    if (!noisyAudio) return;
                    exportComparisonMetricsCsv(results, noisyAudio.name, scenario, blockSize);
                    confirmExport('Exported metrics to sonora_evaluation_metrics.csv.');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-40"
                >
                  <Download className="h-3 w-3" strokeWidth={1.6} />
                  Export Metrics CSV
                </button>

                <button
                  type="button"
                  disabled={results.length === 0 || !noisyAudio}
                  onClick={() => {
                    if (!noisyAudio) return;
                    exportComparisonMetricsJson(results, noisyAudio.name, scenario, blockSize);
                    confirmExport('Exported metrics to sonora_evaluation_metrics.json.');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 font-mono text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-40"
                >
                  <Download className="h-3 w-3" strokeWidth={1.6} />
                  Export Metrics JSON
                </button>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {[
                  { res: firResult, label: 'FIR Output WAV' },
                  { res: iirResult, label: 'IIR Output WAV' },
                  { res: spectralResult, label: 'Spectral WAV' },
                ].map((item) =>
                  item.res ? (
                    <a
                      key={item.label}
                      href={item.res.outputAudio.blobUrl}
                      download={item.res.outputAudio.name}
                      onClick={() => confirmExport(`Downloaded ${item.res?.outputAudio.name}.`)}
                      className="inline-flex items-center justify-center gap-1 rounded-[3px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 font-mono text-[10.5px] text-[var(--text-primary)] hover:border-[var(--accent)]"
                    >
                      <Download className="h-3 w-3" strokeWidth={1.6} />
                      {item.label}
                    </a>
                  ) : (
                    <span
                      key={item.label}
                      className="inline-flex items-center justify-center rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 font-mono text-[10.5px] text-[var(--text-secondary)] opacity-50"
                    >
                      {item.label}
                    </span>
                  )
                )}
              </div>

              {/* Experiment Summary */}
              <div className="mt-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-2.5 font-mono text-[10.5px] text-[var(--text-secondary)]">
                <div>
                  Dataset: {noisyAudio ? noisyAudio.name : 'None'} · Scenario {scenario}
                </div>
                <div className="mt-0.5">
                  FIR: Order {firConfig.order} ({firConfig.windowType}, {firConfig.cutoffHz} Hz) · IIR: Order {iirConfig.order} ({iirConfig.type}, {iirConfig.cutoffHz} Hz)
                </div>
              </div>

              {exportConfirmation && (
                <div className="mt-2 rounded-[2px] border border-[var(--success)] bg-[var(--panel)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--success)]">
                  {exportConfirmation}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
