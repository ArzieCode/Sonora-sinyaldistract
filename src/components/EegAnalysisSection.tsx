import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Play, Upload } from 'lucide-react';
import type Plotly from 'plotly.js-dist-min';
import { PlotlyChart } from './PlotlyChart';
import { computeStftSpectrogram } from '../dsp/fft';
import {
  buildSyntheticEegCalibrationDataset,
  EegDataset,
  EegEvaluationRow,
  EegProcessingOutput,
  parseCsvOrJsonEeg,
  parseEdfBuffer,
  runOfflineEegFiltering,
} from '../dsp/eegOffline';
import { FilterConfig, LabPreferences } from '../types/sonora';

interface EegAnalysisSectionProps {
  dataset: EegDataset | null;
  eegOutput: EegProcessingOutput | null;
  eegHistoryRows: EegEvaluationRow[];
  preferences: LabPreferences;
  onLoadDataset: (ds: EegDataset) => void;
  onProcessedOutput: (out: EegProcessingOutput, rows: EegEvaluationRow[]) => void;
}

export const EegAnalysisSection: React.FC<EegAnalysisSectionProps> = ({
  dataset,
  eegOutput,
  eegHistoryRows,
  preferences,
  onLoadDataset,
  onProcessedOutput,
}) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fallbackFs, setFallbackFs] = useState<number>(256);
  const [importError, setImportError] = useState<string | null>(null);

  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    dataset ? dataset.channelNames.slice(0, 4) : []
  );
  const [focusChannel, setFocusChannel] = useState<string>(
    dataset?.channelNames[0] ?? 'O1'
  );
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(dataset ? Math.min(8, dataset.durationSec) : 8);

  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    architecture: 'IIR',
    type: 'bandpass',
    cutoffHz: 1,
    cutoffHighHz: 40,
    order: 4,
    sampleRate: dataset?.samplingRateHz ?? 256,
    windowType: 'hamming',
    zeroPhase: true,
  });

  const [compareViewMode, setCompareViewMode] = useState<'overlay' | 'side-by-side'>('overlay');
  const [stftMode, setStftMode] = useState<'raw' | 'filtered'>('filtered');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const lower = file.name.toLowerCase();
      let parsed: EegDataset;
      if (lower.endsWith('.edf')) {
        const buf = await file.arrayBuffer();
        parsed = parseEdfBuffer(buf, file.name);
      } else if (lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.json')) {
        const text = await file.text();
        parsed = parseCsvOrJsonEeg(file.name, text, fallbackFs);
      } else {
        throw new Error('Unsupported EEG format. Please upload .edf, .csv, or .json files.');
      }

      onLoadDataset(parsed);
      const initChannels = parsed.channelNames.slice(0, 4);
      setSelectedChannels(initChannels);
      setFocusChannel(initChannels[0]);
      setStartSec(0);
      setEndSec(Math.min(10, parsed.durationSec));
      setFilterConfig((prev) => ({
        ...prev,
        sampleRate: parsed.samplingRateHz,
        cutoffHighHz: Math.min(prev.cutoffHighHz, Math.floor(parsed.samplingRateHz * 0.42)),
      }));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse EEG dataset.');
    }
  };

  const handleLoadCalibrationVector = () => {
    setImportError(null);
    const cal = buildSyntheticEegCalibrationDataset();
    onLoadDataset(cal);
    setSelectedChannels(cal.channelNames.slice(0, 4));
    setFocusChannel(cal.channelNames[0]);
    setStartSec(0);
    setEndSec(cal.durationSec);
    setFilterConfig((prev) => ({
      ...prev,
      sampleRate: cal.samplingRateHz,
      type: 'bandstop',
      cutoffHz: 48,
      cutoffHighHz: 52,
      order: 4,
    }));
  };

  const activeChannels = useMemo(() => {
    if (!dataset) return [];
    const valid = selectedChannels.filter((c) => dataset.channelNames.includes(c));
    return valid.length > 0 ? valid : [dataset.channelNames[0]];
  }, [dataset, selectedChannels]);

  const activeFocusChannel = useMemo(() => {
    if (!dataset) return '';
    return activeChannels.includes(focusChannel) ? focusChannel : activeChannels[0];
  }, [dataset, activeChannels, focusChannel]);

  const handleRunEegFilter = () => {
    if (!dataset) return;
    const out = runOfflineEegFiltering(
      dataset,
      activeChannels,
      startSec,
      endSec,
      filterConfig
    );
    onProcessedOutput(out, out.evaluationRows);
  };

  const toggleChannel = (ch: string) => {
    setSelectedChannels((prev) =>
      prev.includes(ch)
        ? prev.length > 1
          ? prev.filter((x) => x !== ch)
          : prev
        : [...prev, ch]
    );
  };

  // Focus channel comparison data (before filtering if not yet run, or raw vs filtered after run)
  const focusSlice = useMemo(() => {
    if (!dataset || !activeFocusChannel) return null;
    const processed = eegOutput?.channelResults[activeFocusChannel];
    if (processed) return processed;

    const fs = dataset.samplingRateHz;
    const sIdx = Math.max(0, Math.floor(startSec * fs));
    const eIdx = Math.min(dataset.totalSamples, Math.max(sIdx + 32, Math.floor(endSec * fs)));
    const raw = dataset.channels[activeFocusChannel].slice(sIdx, eIdx);
    const timeSec = Array.from({ length: raw.length }, (_, i) =>
      Number(((sIdx + i) / fs).toFixed(4))
    );
    return {
      channel: activeFocusChannel,
      timeSec,
      raw,
      filtered: null as Float32Array | null,
      psdBefore: null,
      psdAfter: null,
      bands: null,
    };
  }, [dataset, activeFocusChannel, eegOutput, startSec, endSec]);

  // Multichannel vertical-offset traces
  const multichannelTraces = useMemo(() => {
    if (!dataset) return { traces: [] as Plotly.Data[], ticks: [] as number[], labels: [] as string[] };
    const fs = dataset.samplingRateHz;
    const sIdx = Math.max(0, Math.floor(startSec * fs));
    const eIdx = Math.min(dataset.totalSamples, Math.max(sIdx + 32, Math.floor(endSec * fs)));

    // Compute robust spacing from channel standard deviations
    let maxStd = 20;
    activeChannels.forEach((ch) => {
      const vec = dataset.channels[ch].subarray(sIdx, eIdx);
      let mean = 0;
      for (let i = 0; i < vec.length; i++) mean += vec[i];
      mean /= Math.max(1, vec.length);
      let vSum = 0;
      for (let i = 0; i < vec.length; i++) vSum += (vec[i] - mean) ** 2;
      const std = Math.sqrt(vSum / Math.max(1, vec.length));
      if (std > maxStd) maxStd = std;
    });

    const stepOffset = Math.max(80, Math.round(maxStd * 4.5));
    const traces: Plotly.Data[] = [];
    const ticks: number[] = [];
    const labels: string[] = [];

    activeChannels.forEach((ch, idx) => {
      const yBase = (activeChannels.length - 1 - idx) * stepOffset;
      ticks.push(yBase);
      labels.push(ch);

      const processed = eegOutput?.channelResults[ch];
      const rawVec = processed
        ? processed.raw
        : dataset.channels[ch].slice(sIdx, eIdx);
      const timeVec = processed
        ? processed.timeSec
        : Array.from({ length: rawVec.length }, (_, i) => Number(((sIdx + i) / fs).toFixed(4)));

      traces.push({
        x: timeVec,
        y: Array.from(rawVec, (v) => v + yBase),
        type: 'scatter',
        mode: 'lines',
        name: idx === 0 ? 'Raw EEG' : ch,
        showlegend: idx === 0,
        line: { color: '#9A9A93', width: 1 },
      });

      if (processed) {
        traces.push({
          x: timeVec,
          y: Array.from(processed.filtered, (v) => v + yBase),
          type: 'scatter',
          mode: 'lines',
          name: idx === 0 ? 'Filtered EEG' : `${ch} filtered`,
          showlegend: idx === 0,
          line: {
            color: '#1F5A4A',
            width: 1.25,
            dash: filterConfig.architecture === 'FIR' ? 'solid' : 'dash',
          },
        });
      }
    });

    return { traces, ticks, labels };
  }, [dataset, activeChannels, eegOutput, startSec, endSec, filterConfig.architecture]);

  // EEG Spectrogram on focus channel
  const eegSpectrogram = useMemo(() => {
    if (!dataset || !focusSlice) return null;
    const vec =
      stftMode === 'filtered' && focusSlice.filtered ? focusSlice.filtered : focusSlice.raw;
    const fftN = dataset.samplingRateHz >= 256 ? 256 : 128;
    const spec = computeStftSpectrogram(vec, dataset.samplingRateHz, fftN, 'hann');
    // Restrict spectrogram display to physiological EEG band <= 60 Hz (or Nyquist)
    const maxHz = Math.min(60, dataset.samplingRateHz / 2);
    const keepCount = spec.frequencies.findIndex((f) => f > maxHz);
    const endFreqIdx = keepCount === -1 ? spec.frequencies.length : keepCount;
    return {
      times: spec.times.map((t) => Number((t + startSec).toFixed(3))),
      frequencies: spec.frequencies.slice(0, endFreqIdx),
      zDb: spec.zDb.slice(0, endFreqIdx),
    };
  }, [dataset, focusSlice, stftMode, startSec]);

  const nyquist = dataset ? Math.floor(dataset.samplingRateHz / 2) : 128;
  const processedFocus = eegOutput?.channelResults[activeFocusChannel] ?? null;

  return (
    <div className="space-y-4">
      {/* 1. EEG DATASET MANAGEMENT */}
      <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                EEG Dataset Management
              </h2>
              <span className="rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                OFFLINE ANALYSIS ONLY
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-secondary)]">
              Import publicly available EEG recordings (.edf, .csv, .json) to inspect raw signals and offline digital filtering.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11.5px]">
              <label className="text-[var(--text-secondary)]">CSV Fs:</label>
              <input
                type="number"
                min={32}
                max={2048}
                value={fallbackFs}
                onChange={(e) => setFallbackFs(Number(e.target.value) || 256)}
                className="w-16 rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 font-mono text-[11.5px]"
              />
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">Hz</span>
            </div>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--panel)]"
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.6} />
              Import EEG (.edf / .csv / .json)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".edf,.csv,.txt,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={handleLoadCalibrationVector}
              className="rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-[11.5px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)]"
            >
              Load Filter Test Vector
            </button>
          </div>
        </div>

        {importError && (
          <div className="mb-3 rounded-[2px] border border-[var(--error)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--error)]">
            {importError}
          </div>
        )}

        {!dataset ? (
          <div className="rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] p-8 text-center">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              No EEG Dataset Imported
            </p>
            <p className="mx-auto mt-1 max-w-lg text-[12px] text-[var(--text-secondary)]">
              Import an open-access EDF, CSV, or JSON EEG dataset to compute waveforms, Welch PSD, spectrograms, and frequency-band metrics—or load the deterministic calibration vector to verify notch and bandpass filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dataset.isSyntheticCalibration && (
              <div className="rounded-[2px] border border-[var(--signal-reference)] bg-[var(--bg)] px-3 py-2 text-[11.5px] text-[var(--text-primary)]">
                <span className="font-semibold text-[var(--signal-reference)]">
                  Calibration Test Signal Notice:
                </span>{' '}
                This is a deterministic synthetic waveform (0.25 Hz drift + 10.5 Hz + 50 Hz mains) for filter verification only, not a real physiological EEG subject recording.
              </div>
            )}

            {/* Metadata Table */}
            <div className="grid grid-cols-2 gap-2.5 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3 text-[11.5px] sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <div className="text-[10.5px] text-[var(--text-secondary)]">Dataset Name</div>
                <div className="mt-0.5 truncate font-mono font-medium">{dataset.name}</div>
              </div>
              <div>
                <div className="text-[10.5px] text-[var(--text-secondary)]">Source</div>
                <div className="mt-0.5 truncate">{dataset.source}</div>
              </div>
              <div>
                <div className="text-[10.5px] text-[var(--text-secondary)]">Sampling Freq</div>
                <div className="mt-0.5 font-mono tabular-nums">{dataset.samplingRateHz} Hz</div>
              </div>
              <div>
                <div className="text-[10.5px] text-[var(--text-secondary)]">Channels</div>
                <div className="mt-0.5 font-mono tabular-nums">{dataset.channelNames.length}</div>
              </div>
              <div>
                <div className="text-[10.5px] text-[var(--text-secondary)]">Duration</div>
                <div className="mt-0.5 font-mono tabular-nums">
                  {dataset.durationSec.toFixed(2)} s
                </div>
              </div>
              <div>
                <div className="text-[10.5px] text-[var(--text-secondary)]">Signal Status</div>
                <div className="mt-0.5 font-mono font-medium text-[var(--signal-reference)]">
                  {dataset.preprocessingStatus} · OFFLINE
                </div>
              </div>
            </div>

            {/* Channel & Time-Window Selection */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3 lg:col-span-7">
                <div className="mb-1.5 flex items-center justify-between text-[11px]">
                  <span className="font-medium text-[var(--text-secondary)]">
                    Channel Selection (Multichannel View &amp; Processing)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)]">Focus Channel:</span>
                    <select
                      value={activeFocusChannel}
                      onChange={(e) => setFocusChannel(e.target.value)}
                      className="rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 font-mono text-[11px]"
                    >
                      {activeChannels.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dataset.channelNames.map((ch) => {
                    const checked = activeChannels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => toggleChannel(ch)}
                        className={`rounded-[2px] border px-2 py-0.5 font-mono text-[11px] ${
                          checked
                            ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.08] font-medium text-[var(--text-primary)]'
                            : 'border-[var(--border)] bg-[var(--panel)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3 lg:col-span-5">
                <div className="mb-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  Time-Window Selection (0.0 – {dataset.durationSec.toFixed(1)} s)
                </div>
                <div className="flex items-center gap-2 text-[11.5px]">
                  <label className="text-[var(--text-secondary)]">Start:</label>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, endSec - 0.5)}
                    step={0.5}
                    value={startSec}
                    onChange={(e) => setStartSec(Math.max(0, Number(e.target.value) || 0))}
                    className="w-20 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px]"
                  />
                  <label className="text-[var(--text-secondary)]">End:</label>
                  <input
                    type="number"
                    min={startSec + 0.5}
                    max={dataset.durationSec}
                    step={0.5}
                    value={endSec}
                    onChange={(e) =>
                      setEndSec(Math.min(dataset.durationSec, Math.max(startSec + 0.5, Number(e.target.value) || 4)))
                    }
                    className="w-20 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[11.5px]"
                  />
                  <span className="font-mono text-[11px] text-[var(--text-secondary)]">s</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. EEG SIGNAL PROCESSING (OFFLINE DIGITAL FILTERING) */}
      {dataset && (
        <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                EEG Digital Filtering (Offline)
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)]">
                Configure FIR or IIR Butterworth high-pass, low-pass, band-pass, or notch filtering independently across selected channels.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunEegFilter}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--accent)] bg-[var(--accent)] px-4 py-1.5 font-mono text-[12px] font-semibold text-[var(--panel)]"
            >
              <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
              APPLY EEG FILTER
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                Filter Architecture
              </label>
              <select
                value={filterConfig.architecture}
                onChange={(e) => {
                  const arch = e.target.value as 'FIR' | 'IIR';
                  setFilterConfig((prev) => ({
                    ...prev,
                    architecture: arch,
                    order: arch === 'FIR' ? 48 : 4,
                  }));
                }}
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-[12px]"
              >
                <option value="IIR">IIR Butterworth</option>
                <option value="FIR">FIR Windowed-Sinc</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                Filter Type
              </label>
              <select
                value={filterConfig.type}
                onChange={(e) =>
                  setFilterConfig((prev) => ({
                    ...prev,
                    type: e.target.value as FilterConfig['type'],
                  }))
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-[12px]"
              >
                <option value="bandpass">Band-pass (e.g. 1–40 Hz)</option>
                <option value="highpass">High-pass (Drift Removal)</option>
                <option value="lowpass">Low-pass</option>
                <option value="bandstop">Notch (50 / 60 Hz Removal)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                {filterConfig.type === 'bandpass' || filterConfig.type === 'bandstop'
                  ? 'Cutoff f₁ / f₂ (Hz)'
                  : 'Cutoff Frequency (Hz)'}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0.5}
                  max={nyquist - 2}
                  step={0.5}
                  value={filterConfig.cutoffHz}
                  onChange={(e) =>
                    setFilterConfig((prev) => ({
                      ...prev,
                      cutoffHz: Math.max(0.5, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-20 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[12px]"
                />
                {(filterConfig.type === 'bandpass' || filterConfig.type === 'bandstop') && (
                  <>
                    <span className="text-[11px] text-[var(--text-secondary)]">–</span>
                    <input
                      type="number"
                      min={filterConfig.cutoffHz + 1}
                      max={nyquist - 1}
                      step={0.5}
                      value={filterConfig.cutoffHighHz}
                      onChange={(e) =>
                        setFilterConfig((prev) => ({
                          ...prev,
                          cutoffHighHz: Math.max(prev.cutoffHz + 1, Number(e.target.value) || 40),
                        }))
                      }
                      className="w-20 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[12px]"
                    />
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                Filter Order
              </label>
              <input
                type="number"
                min={filterConfig.architecture === 'FIR' ? 8 : 1}
                max={filterConfig.architecture === 'FIR' ? 128 : 8}
                step={filterConfig.architecture === 'FIR' ? 2 : 1}
                value={filterConfig.order}
                onChange={(e) =>
                  setFilterConfig((prev) => ({
                    ...prev,
                    order: Math.max(1, Number(e.target.value) || 4),
                  }))
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[12px]"
              />
            </div>
          </div>

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Advanced EEG Preprocessing Options
            </button>
            {advancedOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-5 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-2.5 text-[11.5px]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filterConfig.zeroPhase}
                    onChange={(e) =>
                      setFilterConfig((prev) => ({ ...prev, zeroPhase: e.target.checked }))
                    }
                    className="accent-[var(--accent)]"
                  />
                  <span>Zero-phase bidirectional filtering (preserves ERP/oscillation phase)</span>
                </label>
                {filterConfig.architecture === 'FIR' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)]">FIR Window:</span>
                    <select
                      value={filterConfig.windowType}
                      onChange={(e) =>
                        setFilterConfig((prev) => ({
                          ...prev,
                          windowType: e.target.value as FilterConfig['windowType'],
                        }))
                      }
                      className="rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11.5px] capitalize"
                    >
                      <option value="hamming">Hamming</option>
                      <option value="hann">Hann</option>
                      <option value="blackman">Blackman</option>
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. EEG VISUALIZATIONS */}
      {dataset && (
        <>
          {/* A. Multichannel EEG Waveform */}
          <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Multichannel EEG Waveform (Vertical Offset)
                </h3>
                <p className="text-[11.5px] text-[var(--text-secondary)]">
                  Raw EEG (#9A9A93) vs. Filtered EEG (#1F5A4A) across selected channels (µV)
                </p>
              </div>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                Window: {startSec.toFixed(1)}–{endSec.toFixed(1)} s
              </span>
            </div>

            <PlotlyChart
              height={Math.max(240, activeChannels.length * 70)}
              showGrid={preferences.showGrid}
              data={multichannelTraces.traces}
              layout={{
                xaxis: { title: { text: 'Time (s)', font: { size: 11 } } },
                yaxis: {
                  title: { text: 'Channel / Relative Offset (µV)', font: { size: 11 } },
                  tickvals: multichannelTraces.ticks,
                  ticktext: multichannelTraces.labels,
                },
              }}
            />
          </section>

          {/* B. Before-and-After Comparison on Focus Channel */}
          {focusSlice && (
            <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    Before-and-After Channel Comparison · {activeFocusChannel}
                  </h3>
                  <p className="text-[11.5px] text-[var(--text-secondary)]">
                    Synchronized amplitude (µV) and time range inspection
                  </p>
                </div>

                <div className="inline-flex rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setCompareViewMode('overlay')}
                    className={`rounded-[2px] px-2.5 py-1 text-[11px] font-medium ${
                      compareViewMode === 'overlay'
                        ? 'bg-[var(--accent)] text-[var(--panel)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Overlay
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareViewMode('side-by-side')}
                    className={`rounded-[2px] px-2.5 py-1 text-[11px] font-medium ${
                      compareViewMode === 'side-by-side'
                        ? 'bg-[var(--accent)] text-[var(--panel)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Side-by-Side
                  </button>
                </div>
              </div>

              {compareViewMode === 'overlay' ? (
                <PlotlyChart
                  height={230}
                  showGrid={preferences.showGrid}
                  data={[
                    {
                      x: focusSlice.timeSec,
                      y: Array.from(focusSlice.raw),
                      type: 'scatter',
                      mode: 'lines',
                      name: `Raw ${activeFocusChannel}`,
                      line: { color: '#9A9A93', width: 1.1 },
                    },
                    ...(focusSlice.filtered
                      ? [
                          {
                            x: focusSlice.timeSec,
                            y: Array.from(focusSlice.filtered),
                            type: 'scatter' as const,
                            mode: 'lines' as const,
                            name: `Filtered ${activeFocusChannel}`,
                            line: { color: '#1F5A4A', width: 1.4 },
                          },
                        ]
                      : []),
                  ]}
                  layout={{
                    xaxis: { title: { text: 'Time (s)', font: { size: 11 } } },
                    yaxis: { title: { text: 'Amplitude (µV)', font: { size: 11 } } },
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <PlotlyChart
                    height={210}
                    showGrid={preferences.showGrid}
                    data={[
                      {
                        x: focusSlice.timeSec,
                        y: Array.from(focusSlice.raw),
                        type: 'scatter',
                        mode: 'lines',
                        name: `Raw ${activeFocusChannel}`,
                        line: { color: '#9A9A93', width: 1.1 },
                      },
                    ]}
                    layout={{
                      xaxis: { title: { text: 'Time (s)', font: { size: 11 } } },
                      yaxis: { title: { text: 'Raw (µV)', font: { size: 11 } } },
                    }}
                  />
                  <PlotlyChart
                    height={210}
                    showGrid={preferences.showGrid}
                    data={[
                      {
                        x: focusSlice.timeSec,
                        y: focusSlice.filtered
                          ? Array.from(focusSlice.filtered)
                          : Array.from(focusSlice.raw),
                        type: 'scatter',
                        mode: 'lines',
                        name: focusSlice.filtered
                          ? `Filtered ${activeFocusChannel}`
                          : 'Apply filter to view output',
                        line: {
                          color: focusSlice.filtered ? '#1F5A4A' : '#D8D3C7',
                          width: 1.3,
                        },
                      },
                    ]}
                    layout={{
                      xaxis: { title: { text: 'Time (s)', font: { size: 11 } } },
                      yaxis: { title: { text: 'Filtered (µV)', font: { size: 11 } } },
                    }}
                  />
                </div>
              )}
            </section>
          )}

          {/* C. PSD & D. EEG Spectrogram */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Power Spectral Density (Welch PSD) · {activeFocusChannel}
              </h3>
              <p className="mb-2 text-[11.5px] text-[var(--text-secondary)]">
                Raw vs. Filtered PSD (µV²/Hz) with Delta (0.5–4), Theta (4–8), Alpha (8–13), Beta (13–30), and Gamma (30–45 Hz) bands
              </p>

              {processedFocus ? (
                <PlotlyChart
                  height={250}
                  showGrid={preferences.showGrid}
                  data={[
                    {
                      x: processedFocus.psdBefore.frequencies.filter((f) => f <= Math.min(60, nyquist)),
                      y: processedFocus.psdBefore.psd.slice(
                        0,
                        processedFocus.psdBefore.frequencies.filter((f) => f <= Math.min(60, nyquist)).length
                      ),
                      type: 'scatter',
                      mode: 'lines',
                      name: 'Raw PSD',
                      line: { color: '#9A9A93', width: 1.3 },
                    },
                    {
                      x: processedFocus.psdAfter.frequencies.filter((f) => f <= Math.min(60, nyquist)),
                      y: processedFocus.psdAfter.psd.slice(
                        0,
                        processedFocus.psdAfter.frequencies.filter((f) => f <= Math.min(60, nyquist)).length
                      ),
                      type: 'scatter',
                      mode: 'lines',
                      name: 'Filtered PSD',
                      line: { color: '#1F5A4A', width: 1.5 },
                    },
                  ]}
                  layout={{
                    xaxis: {
                      title: { text: 'Frequency (Hz)', font: { size: 11 } },
                      range: [0.5, Math.min(60, nyquist)],
                    },
                    yaxis: { title: { text: 'PSD (µV²/Hz)', font: { size: 11 } } },
                    shapes: [4, 8, 13, 30, 45]
                      .filter((f) => f < nyquist)
                      .map((f) => ({
                        type: 'line' as const,
                        x0: f,
                        x1: f,
                        y0: 0,
                        y1: 1,
                        yref: 'paper' as const,
                        line: { color: '#D8D3C7', width: 1, dash: 'dot' as const },
                      })),
                  }}
                />
              ) : (
                <div className="flex h-[250px] items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12px] text-[var(--text-secondary)]">
                  Click &ldquo;APPLY EEG FILTER&rdquo; to compute Raw vs. Filtered Welch PSD.
                </div>
              )}
            </section>

            <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    EEG Spectrogram (STFT) · {activeFocusChannel}
                  </h3>
                  <p className="text-[11.5px] text-[var(--text-secondary)]">
                    Time-frequency spectral distribution (0–{Math.min(60, nyquist)} Hz)
                  </p>
                </div>

                <select
                  value={stftMode}
                  onChange={(e) => setStftMode(e.target.value as 'raw' | 'filtered')}
                  className="rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[11.5px]"
                >
                  <option value="raw">Raw EEG</option>
                  <option value="filtered" disabled={!processedFocus}>
                    Filtered EEG
                  </option>
                </select>
              </div>

              {eegSpectrogram && (
                <PlotlyChart
                  height={250}
                  showGrid={preferences.showGrid}
                  data={[
                    {
                      x: eegSpectrogram.times,
                      y: eegSpectrogram.frequencies,
                      z: eegSpectrogram.zDb,
                      type: 'heatmap',
                      colorscale: [
                        [0, '#FBFAF6'],
                        [0.4, '#D8D3C7'],
                        [0.75, '#8C3B1F'],
                        [1, '#1E2226'],
                      ],
                      colorbar: {
                        thickness: 10,
                        title: { text: 'dB (µV)', font: { size: 10 } },
                        tickfont: { family: '"IBM Plex Mono", monospace', size: 9.5 },
                      },
                    },
                  ]}
                  layout={{
                    xaxis: { title: { text: 'Time (s)', font: { size: 11 } } },
                    yaxis: { title: { text: 'Frequency (Hz)', font: { size: 11 } } },
                  }}
                />
              )}
            </section>
          </div>

          {/* E. Frequency Band Analysis */}
          {processedFocus && (
            <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Frequency Band Analysis · Channel {activeFocusChannel}
              </h3>
              <p className="mb-3 text-[11.5px] text-[var(--text-secondary)]">
                Absolute (µV²) and relative (%) band power before and after filtering, evaluated strictly for bands below the Nyquist limit ({nyquist} Hz).
              </p>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[11.5px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg)]/70 text-[var(--text-secondary)]">
                      <th className="px-2.5 py-2 font-semibold">Band</th>
                      <th className="px-2.5 py-2 font-semibold">Range</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Before (µV²)</th>
                      <th className="px-2.5 py-2 text-right font-semibold">After (µV²)</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Rel. Before (%)</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Rel. After (%)</th>
                      <th className="px-2.5 py-2 text-right font-semibold">Δ Band Power (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                    {processedFocus.bands.map((b) => (
                      <tr key={b.band}>
                        <td className="px-2.5 py-2 font-sans font-medium text-[var(--text-primary)]">
                          {b.band}
                        </td>
                        <td className="px-2.5 py-2 text-[var(--text-secondary)]">{b.rangeHz}</td>
                        <td className="px-2.5 py-2 text-right">
                          {b.supported && b.powerBefore !== null
                            ? b.powerBefore.toFixed(2)
                            : 'Unsupported'}
                        </td>
                        <td className="px-2.5 py-2 text-right font-semibold text-[var(--signal-denoised)]">
                          {b.supported && b.powerAfter !== null
                            ? b.powerAfter.toFixed(2)
                            : 'Unsupported'}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          {b.supported && b.relativeBeforePct !== null
                            ? `${b.relativeBeforePct.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          {b.supported && b.relativeAfterPct !== null
                            ? `${b.relativeAfterPct.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="px-2.5 py-2 text-right">
                          {b.supported && b.deltaPct !== null
                            ? `${b.deltaPct >= 0 ? '+' : ''}${b.deltaPct.toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 4. EEG EVALUATION TABLE & SCIENTIFIC DISCLOSURE */}
          <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
              EEG Filtering Evaluation Table (Offline)
            </h3>
            <p className="mb-3 text-[11.5px] text-[var(--text-secondary)]">
              Comparison of FIR and IIR Butterworth runs across selected EEG channels.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg)]/70 text-[var(--text-secondary)]">
                    <th className="px-2 py-2 font-semibold">Method</th>
                    <th className="px-2 py-2 font-semibold">Ch</th>
                    <th className="px-2 py-2 text-right font-semibold">Fs (Hz)</th>
                    <th className="px-2 py-2 font-semibold">Filter Configuration</th>
                    <th className="px-2 py-2 text-right font-semibold">Power Before (µV²)</th>
                    <th className="px-2 py-2 text-right font-semibold">Power After (µV²)</th>
                    <th className="px-2 py-2 text-right font-semibold">ΔAlpha / Δ50Hz</th>
                    <th className="px-2 py-2 text-right font-semibold">Time (ms)</th>
                    <th className="px-2 py-2 text-right font-semibold">MSE / RMSE / SNR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                  {eegHistoryRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-3 py-5 text-center font-sans text-[12px] text-[var(--text-secondary)]"
                      >
                        Apply an FIR or IIR Butterworth EEG filter above to populate evaluation metrics.
                      </td>
                    </tr>
                  ) : (
                    eegHistoryRows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-2 py-2 font-sans font-medium text-[var(--text-primary)]">
                          {row.methodLabel}
                        </td>
                        <td className="px-2 py-2">{row.channel}</td>
                        <td className="px-2 py-2 text-right">{row.samplingRateHz}</td>
                        <td className="px-2 py-2 font-sans text-[var(--text-secondary)]">
                          {row.filterSummary}
                        </td>
                        <td className="px-2 py-2 text-right">{row.powerBeforeUv2.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-[var(--signal-denoised)]">
                          {row.powerAfterUv2.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {row.alphaChangePct !== null ? `${row.alphaChangePct.toFixed(1)}%` : '—'} /{' '}
                          {row.line50HzChangePct !== null
                            ? `${row.line50HzChangePct.toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {row.processingTimeMs.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right font-sans text-[var(--text-secondary)]">
                          {row.mse !== null ? row.mse.toExponential(2) : 'Not Available'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3 text-[11.5px] leading-relaxed text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">Filtering Limitations &amp; Interpretation Notice:</strong>{' '}
              A reduction in total EEG signal power does not indicate improved signal quality, as overly narrow cutoffs or high filter orders can attenuate clinically relevant oscillations (Delta through Gamma) or introduce ringing artifacts. MSE, RMSE, and SNR remain &ldquo;Not Available&rdquo; unless an aligned artifact-free ground-truth EEG reference exists.
            </div>
          </section>
        </>
      )}
    </div>
  );
};
