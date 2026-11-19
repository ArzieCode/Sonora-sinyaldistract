import React from 'react';
import { MethodComparisonResult } from '../dsp/blockProcessor';
import { EegDataset, EegEvaluationRow } from '../dsp/eegOffline';
import { DataScenario } from '../dsp/scenarios';
import { AudioSignalData } from '../types/sonora';

interface CrossDomainSectionProps {
  audioDataset: AudioSignalData | null;
  audioScenario: DataScenario;
  audioResults: MethodComparisonResult[];
  audioBlockSize: number;
  eegDataset: EegDataset | null;
  eegRows: EegEvaluationRow[];
}

export const CrossDomainSection: React.FC<CrossDomainSectionProps> = ({
  audioDataset,
  audioScenario,
  audioResults,
  audioBlockSize,
  eegDataset,
  eegRows,
}) => {
  const audioFir = audioResults.find((r) => r.methodId === 'fir');
  const audioIir = audioResults.find((r) => r.methodId === 'iir');
  const audioSpec = audioResults.find((r) => r.methodId === 'spectral');

  const eegFir = eegRows.find((r) => r.architecture === 'FIR');
  const eegIir = eegRows.find((r) => r.architecture === 'IIR');

  return (
    <div className="space-y-4">
      {/* Methodological Separation Banner */}
      <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Cross-Domain DSP Comparison · Audio vs. EEG
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          Side-by-side comparison of digital filtering behavior across acoustic waveforms and electrophysiological EEG recordings. Audio SNR (dB) and EEG band power (µV² / %) quantify fundamentally different physical phenomena and are therefore reported separately without cross-domain normalization.
        </p>
      </section>

      {/* Two-Column Domain Summaries */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* AUDIO DOMAIN SUMMARY */}
        <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-2">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Audio Processing Results
              </h3>
              <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                {audioDataset ? `${audioDataset.name} · Scenario ${audioScenario}` : 'No audio loaded'}
              </p>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              {audioDataset ? `${audioDataset.sampleRate.toLocaleString('en-US')} Hz` : '—'}
            </span>
          </div>

          {audioResults.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12px] text-[var(--text-secondary)]">
              Run Audio Method Comparison to populate acoustic metrics.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="py-1.5 font-medium">Method</th>
                  <th className="py-1.5 text-right font-medium">
                    Output SNR {audioScenario === 'B' ? '(Est.)' : '(dB)'}
                  </th>
                  <th className="py-1.5 text-right font-medium">ΔSNR (dB)</th>
                  <th className="py-1.5 text-right font-medium">Block Time (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                {[audioFir, audioIir, audioSpec].map(
                  (r) =>
                    r && (
                      <tr key={r.methodId}>
                        <td className="py-2 font-sans font-medium text-[var(--text-primary)]">
                          {r.methodId === 'fir'
                            ? 'FIR Filter'
                            : r.methodId === 'iir'
                              ? 'IIR Butterworth'
                              : 'Spectral Subtraction'}
                        </td>
                        <td className="py-2 text-right font-semibold text-[var(--signal-denoised)]">
                          {r.outputSnrDb !== null ? r.outputSnrDb.toFixed(2) : 'Not Available'}
                        </td>
                        <td className="py-2 text-right">
                          {r.snrImprovementDb !== null
                            ? `${r.snrImprovementDb >= 0 ? '+' : ''}${r.snrImprovementDb.toFixed(2)}`
                            : 'Not Available'}
                        </td>
                        <td className="py-2 text-right">{r.computePerBlockMs.toFixed(3)}</td>
                      </tr>
                    )
                )}
              </tbody>
            </table>
          )}

          <div className="mt-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[11.5px] text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">Audio Metric Meaning:</strong>{' '}
            Block size = <span className="font-mono">{audioBlockSize}</span> samples. Audio SNR measures desired acoustic signal energy relative to broadband or harmonic interference.
          </div>
        </section>

        {/* EEG DOMAIN SUMMARY */}
        <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-2">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                EEG Processing Results (Offline)
              </h3>
              <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                {eegDataset ? `${eegDataset.name} · ${eegDataset.preprocessingStatus}` : 'No EEG dataset loaded'}
              </p>
            </div>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              {eegDataset ? `${eegDataset.samplingRateHz} Hz` : '—'}
            </span>
          </div>

          {eegRows.length === 0 ? (
            <div className="flex h-36 items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12px] text-[var(--text-secondary)]">
              Apply FIR or IIR Butterworth filtering in EEG Signal Analysis to populate EEG metrics.
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <th className="py-1.5 font-medium">Method / Ch</th>
                  <th className="py-1.5 text-right font-medium">Power Before (µV²)</th>
                  <th className="py-1.5 text-right font-medium">Power After (µV²)</th>
                  <th className="py-1.5 text-right font-medium">Proc. Time (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                {eegRows.slice(0, 6).map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 font-sans font-medium text-[var(--text-primary)]">
                      {row.methodLabel} ({row.channel})
                    </td>
                    <td className="py-2 text-right">{row.powerBeforeUv2.toFixed(2)}</td>
                    <td className="py-2 text-right font-semibold text-[var(--signal-denoised)]">
                      {row.powerAfterUv2.toFixed(2)}
                    </td>
                    <td className="py-2 text-right">{row.processingTimeMs.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[11.5px] text-[var(--text-secondary)]">
            <strong className="text-[var(--text-primary)]">EEG Metric Meaning:</strong>{' '}
            EEG evaluation tracks physiological band preservation (Delta–Gamma µV²) and artifact attenuation rather than perceptual audio SNR.
          </div>
        </section>
      </div>

      {/* FIR vs IIR & Spectral Characteristics Comparative Matrix */}
      <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
        <h3 className="mb-3 text-[14px] font-semibold text-[var(--text-primary)]">
          FIR vs. IIR Performance &amp; Spectral Characteristics
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/70 text-[var(--text-secondary)]">
                <th className="px-3 py-2 font-semibold">Characteristic</th>
                <th className="px-3 py-2 font-semibold">Audio Domain</th>
                <th className="px-3 py-2 font-semibold">EEG Domain (Offline)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              <tr>
                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                  Spectral Bandwidth
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  20 Hz – {audioDataset ? `${Math.floor(audioDataset.sampleRate / 2).toLocaleString('en-US')} Hz` : '8,000 Hz'} (Acoustic / Harmonic)
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  0.5 Hz – 45 Hz (Delta, Theta, Alpha, Beta, Gamma)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                  FIR Processing Time
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  {audioFir ? `${audioFir.computePerBlockMs.toFixed(3)} ms / block` : 'Not run yet'}
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  {eegFir ? `${eegFir.processingTimeMs.toFixed(2)} ms (channel window)` : 'Not run yet'}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                  IIR Butterworth Processing Time
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  {audioIir ? `${audioIir.computePerBlockMs.toFixed(3)} ms / block` : 'Not run yet'}
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px]">
                  {eegIir ? `${eegIir.processingTimeMs.toFixed(2)} ms (channel window)` : 'Not run yet'}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                  Phase &amp; Filter Design Considerations
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  Linear-phase FIR or low-order IIR + Spectral Subtraction for stationary acoustic noise.
                </td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">
                  Zero-phase filtering preferred to prevent morphological phase distortion across neural waves.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
