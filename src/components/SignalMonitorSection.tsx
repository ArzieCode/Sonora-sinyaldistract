import React, { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { PlotlyChart } from './PlotlyChart';
import { MethodComparisonResult, MethodId } from '../dsp/blockProcessor';
import { computeMagnitudeSpectrum, computeStftSpectrogram } from '../dsp/fft';
import { computeSignalMetrics, downsampleWaveform } from '../dsp/metrics';
import { AudioSignalData, LabPreferences } from '../types/sonora';

interface SignalMonitorSectionProps {
  noisyAudio: AudioSignalData | null;
  referenceAudio: AudioSignalData | null;
  results: MethodComparisonResult[];
  isRecording: boolean;
  liveTimeDomain: number[];
  liveFftDb: { freqs: number[]; db: number[] } | null;
  playbackTimeSec: number | null;
  preferences: LabPreferences;
  showFrequencyPanels?: boolean;
}

export const SignalMonitorSection: React.FC<SignalMonitorSectionProps> = ({
  noisyAudio,
  referenceAudio,
  results,
  isRecording,
  liveTimeDomain,
  liveFftDb,
  playbackTimeSec,
  preferences,
  showFrequencyPanels = true,
}) => {
  const [resetRevision, setResetRevision] = useState(0);
  const [stftSource, setStftSource] = useState<'noisy' | MethodId>('noisy');
  const [visibleMethods, setVisibleMethods] = useState<Record<MethodId, boolean>>({
    fir: true,
    iir: true,
    spectral: true,
  });

  const sampleRate = noisyAudio?.sampleRate ?? preferences.defaultSampleRate;

  const signalMetrics = useMemo(() => {
    if (!noisyAudio) return null;
    return computeSignalMetrics(noisyAudio.samples, noisyAudio.sampleRate, noisyAudio.channels);
  }, [noisyAudio]);

  const noisyWave = useMemo(() => {
    if (!noisyAudio) return null;
    return downsampleWaveform(noisyAudio.samples, noisyAudio.sampleRate, 2200);
  }, [noisyAudio]);

  const refWave = useMemo(() => {
    if (!referenceAudio) return null;
    return downsampleWaveform(referenceAudio.samples, referenceAudio.sampleRate, 2200);
  }, [referenceAudio]);

  const methodWaves = useMemo(() => {
    return results.map((r) => ({
      id: r.methodId,
      label: r.methodLabel,
      lineDash: r.lineDash,
      wave: downsampleWaveform(r.outputAudio.samples, r.outputAudio.sampleRate, 2200),
    }));
  }, [results]);

  const fftNoisy = useMemo(() => {
    if (!noisyAudio) return null;
    return computeMagnitudeSpectrum(noisyAudio.samples, noisyAudio.sampleRate, 2048, 'hann');
  }, [noisyAudio]);

  const fftMethods = useMemo(() => {
    return results.map((r) => ({
      id: r.methodId,
      label: r.methodLabel,
      lineDash: r.lineDash,
      fft: computeMagnitudeSpectrum(r.outputAudio.samples, r.outputAudio.sampleRate, 2048, 'hann'),
    }));
  }, [results]);

  const spectrogram = useMemo(() => {
    if (!noisyAudio) return null;
    if (stftSource === 'noisy') {
      return computeStftSpectrogram(noisyAudio.samples, noisyAudio.sampleRate, 512, 'hann');
    }
    const found = results.find((r) => r.methodId === stftSource);
    const target = found ? found.outputAudio : noisyAudio;
    return computeStftSpectrogram(target.samples, target.sampleRate, 512, 'hann');
  }, [noisyAudio, results, stftSource]);

  const toggleMethod = (id: MethodId) => {
    setVisibleMethods((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-4">
      {/* SIGNAL MONITOR — MAIN WAVEFORM VISUALIZATION */}
      <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Signal Monitor
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)]">
              {isRecording
                ? 'Live microphone acquisition trace'
                : 'Time-domain comparison: Noisy Input (gray), Denoised Outputs (forest green: solid=FIR, dashed=IIR, dotted=Spectral), Reference (ochre)'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {results.length > 0 && !isRecording && (
              <>
                {(
                  [
                    { id: 'fir', label: 'FIR (Solid)' },
                    { id: 'iir', label: 'IIR (Dashed)' },
                    { id: 'spectral', label: 'Spectral (Dotted)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMethod(m.id)}
                    className={`rounded-[2px] border px-2 py-1 font-mono text-[10.5px] transition-colors ${
                      visibleMethods[m.id]
                        ? 'border-[var(--signal-denoised)] bg-[var(--bg)] text-[var(--signal-denoised)]'
                        : 'border-[var(--border)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </>
            )}

            <button
              type="button"
              onClick={() => setResetRevision((r) => r + 1)}
              className="inline-flex items-center gap-1 rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)]"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.6} />
              Reset Zoom
            </button>
          </div>
        </div>

        {/* Time-domain summary strip */}
        {signalMetrics && !isRecording && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[11px] sm:grid-cols-4">
            <div>
              <span className="text-[var(--text-secondary)]">Duration: </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {signalMetrics.durationSec.toFixed(3)} s
              </span>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Peak Range: </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                [{signalMetrics.minAmplitude.toFixed(3)}, {signalMetrics.maxAmplitude.toFixed(3)}]
              </span>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">RMS Amplitude: </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {signalMetrics.rmsAmplitude.toFixed(4)}
              </span>
            </div>
            <div>
              <span className="text-[var(--text-secondary)]">Dominant Freq: </span>
              <span className="font-mono tabular-nums text-[var(--text-primary)]">
                {fftNoisy?.dominantPeaks[0]
                  ? `${fftNoisy.dominantPeaks[0].frequencyHz.toFixed(1)} Hz`
                  : '—'}
              </span>
            </div>
          </div>
        )}

        {isRecording ? (
          <PlotlyChart
            height={275}
            showGrid={preferences.showGrid}
            data={[
              {
                x: liveTimeDomain.map((_, idx) => idx),
                y: liveTimeDomain,
                type: 'scatter',
                mode: 'lines',
                name: 'Live Microphone Input',
                line: { color: '#9A9A93', width: 1.2 },
              },
            ]}
            layout={{
              xaxis: { title: { text: 'Buffer Sample Index', font: { size: 11 } } },
              yaxis: { title: { text: 'Amplitude', font: { size: 11 } }, range: [-1.0, 1.0] },
            }}
          />
        ) : noisyWave ? (
          <PlotlyChart
            key={`wave-${resetRevision}-${noisyAudio?.id ?? 'none'}`}
            height={285}
            showGrid={preferences.showGrid}
            data={[
              {
                x: noisyWave.times,
                y: noisyWave.amplitudes,
                type: 'scatter',
                mode: 'lines',
                name: 'Noisy Input',
                line: { color: '#9A9A93', width: 1.05 },
              },
              ...methodWaves
                .filter((m) => visibleMethods[m.id])
                .map((m) => ({
                  x: m.wave.times,
                  y: m.wave.amplitudes,
                  type: 'scatter' as const,
                  mode: 'lines' as const,
                  name:
                    m.id === 'fir'
                      ? 'FIR Output'
                      : m.id === 'iir'
                        ? 'IIR Output'
                        : 'Spectral Subtraction Output',
                  line: { color: '#1F5A4A', width: 1.35, dash: m.lineDash },
                })),
              ...(refWave
                ? [
                    {
                      x: refWave.times,
                      y: refWave.amplitudes,
                      type: 'scatter' as const,
                      mode: 'lines' as const,
                      name: 'Clean Reference',
                      line: { color: '#B07A1E', width: 1.15 },
                    },
                  ]
                : []),
            ]}
            layout={{
              dragmode: 'zoom',
              xaxis: { title: { text: 'Time (s)', font: { size: 11 } } },
              yaxis: { title: { text: 'Amplitude', font: { size: 11 } }, range: [-1.05, 1.05] },
              shapes:
                playbackTimeSec !== null
                  ? [
                      {
                        type: 'line',
                        x0: playbackTimeSec,
                        x1: playbackTimeSec,
                        y0: -1.05,
                        y1: 1.05,
                        line: { color: '#8C3B1F', width: 1.5 },
                      },
                    ]
                  : [],
            }}
          />
        ) : (
          <div className="flex h-[260px] items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12.5px] text-[var(--text-secondary)]">
            No audio signal loaded. Record from microphone, upload a WAV file, or initialize Scenario A/B.
          </div>
        )}
      </section>

      {/* FREQUENCY ANALYSIS & TIME-FREQUENCY ANALYSIS */}
      {showFrequencyPanels && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* LEFT: FFT SPECTRUM */}
          <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Frequency Analysis · FFT Spectrum
                </h3>
                <p className="text-[11.5px] text-[var(--text-secondary)]">
                  Before processing vs. FIR, IIR, and Spectral Subtraction magnitude spectra
                </p>
              </div>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                Fs = {sampleRate.toLocaleString('en-US')} Hz
              </span>
            </div>

            {isRecording && liveFftDb ? (
              <PlotlyChart
                height={250}
                showGrid={preferences.showGrid}
                data={[
                  {
                    x: liveFftDb.freqs,
                    y: liveFftDb.db,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Live Mic FFT',
                    line: { color: '#9A9A93', width: 1.3 },
                  },
                ]}
                layout={{
                  xaxis: {
                    title: { text: 'Frequency (Hz)', font: { size: 11 } },
                    type: preferences.fftScale,
                  },
                  yaxis: {
                    title: { text: 'Magnitude (dBFS)', font: { size: 11 } },
                    range: [-110, 0],
                  },
                }}
              />
            ) : fftNoisy ? (
              <PlotlyChart
                height={250}
                showGrid={preferences.showGrid}
                data={[
                  {
                    x: fftNoisy.frequencies,
                    y: fftNoisy.magnitudeDb,
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Before Processing',
                    line: { color: '#9A9A93', width: 1.2 },
                  },
                  ...fftMethods
                    .filter((m) => visibleMethods[m.id])
                    .map((m) => ({
                      x: m.fft.frequencies,
                      y: m.fft.magnitudeDb,
                      type: 'scatter' as const,
                      mode: 'lines' as const,
                      name: `After ${m.id.toUpperCase()}`,
                      line: { color: '#1F5A4A', width: 1.35, dash: m.lineDash },
                    })),
                ]}
                layout={{
                  xaxis: {
                    title: { text: 'Frequency (Hz)', font: { size: 11 } },
                    type: preferences.fftScale,
                  },
                  yaxis: {
                    title: { text: 'Magnitude (dBFS)', font: { size: 11 } },
                    range: [-110, 0],
                  },
                }}
              />
            ) : (
              <div className="flex h-[250px] items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12px] text-[var(--text-secondary)]">
                FFT spectrum unavailable until audio is loaded.
              </div>
            )}
          </section>

          {/* RIGHT: TIME-FREQUENCY SPECTROGRAM */}
          <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Time-Frequency Analysis · Spectrogram
                </h3>
                <p className="text-[11.5px] text-[var(--text-secondary)]">
                  STFT power density across time and frequency (N = 512, Hann)
                </p>
              </div>

              <select
                value={stftSource}
                onChange={(e) => setStftSource(e.target.value as 'noisy' | MethodId)}
                aria-label="Spectrogram source"
                className="rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11.5px] text-[var(--text-primary)]"
              >
                <option value="noisy">Before Processing</option>
                {results.map((r) => (
                  <option key={r.methodId} value={r.methodId}>
                    After: {r.methodId.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {spectrogram ? (
              <PlotlyChart
                height={250}
                showGrid={preferences.showGrid}
                data={[
                  {
                    x: spectrogram.times,
                    y: spectrogram.frequencies,
                    z: spectrogram.zDb,
                    type: 'heatmap',
                    colorscale: [
                      [0, '#FBFAF6'],
                      [0.35, '#D8D3C7'],
                      [0.7, '#8C3B1F'],
                      [1, '#1E2226'],
                    ],
                    zmin: preferences.spectrogramRangeMin,
                    zmax: preferences.spectrogramRangeMax,
                    colorbar: {
                      thickness: 10,
                      title: { text: 'dBFS', font: { size: 10, color: '#1E2226' } },
                      tickfont: { family: '"IBM Plex Mono", monospace', size: 9.5, color: '#6A6F75' },
                    },
                  },
                ]}
                layout={{
                  xaxis: { title: { text: 'Time (s)', font: { size: 11 } } },
                  yaxis: { title: { text: 'Frequency (Hz)', font: { size: 11 } } },
                }}
              />
            ) : (
              <div className="flex h-[250px] items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12px] text-[var(--text-secondary)]">
                STFT spectrogram unavailable until audio is loaded.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
