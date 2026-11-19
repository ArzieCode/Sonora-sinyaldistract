import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Mic, Square, Upload } from 'lucide-react';
import { formatFileSize } from '../dsp/audioUtils';
import { DataScenario, SyntheticNoiseKind } from '../dsp/scenarios';
import { AudioSignalData } from '../types/sonora';

interface AudioInputSectionProps {
  activeAudio: AudioSignalData | null;
  referenceAudio: AudioSignalData | null;
  isRecording: boolean;
  recordingDurationSec: number;
  micLevelDb: number;
  micLevelPct: number;
  micPermission: 'prompt' | 'granted' | 'denied';
  scenario: DataScenario;
  syntheticNoiseKind: SyntheticNoiseKind;
  syntheticSnrDb: number;
  noiseSegmentSec: number;
  alignmentOffsetSamples: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onUploadNoisy: (file: File) => void;
  onUploadReference: (file: File) => void;
  onSelectScenario: (s: DataScenario) => void;
  onChangeSyntheticNoise: (kind: SyntheticNoiseKind) => void;
  onChangeSyntheticSnr: (snr: number) => void;
  onApplyScenarioA: () => void;
  onChangeNoiseSegmentSec: (sec: number) => void;
  onLoadScenarioBSample: () => void;
  onChangeAlignmentOffset: (samples: number) => void;
}

export const AudioInputSection: React.FC<AudioInputSectionProps> = ({
  activeAudio,
  referenceAudio,
  isRecording,
  recordingDurationSec,
  micLevelDb,
  micLevelPct,
  micPermission,
  scenario,
  syntheticNoiseKind,
  syntheticSnrDb,
  noiseSegmentSec,
  alignmentOffsetSamples,
  onStartRecording,
  onStopRecording,
  onUploadNoisy,
  onUploadReference,
  onSelectScenario,
  onChangeSyntheticNoise,
  onChangeSyntheticSnr,
  onApplyScenarioA,
  onChangeNoiseSegmentSec,
  onLoadScenarioBSample,
  onChangeAlignmentOffset,
}) => {
  const [inputMode, setInputMode] = useState<'upload' | 'microphone'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [scenarioPanelOpen, setScenarioPanelOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const noisyInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectedFile = (file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.wav') && !ext.endsWith('.mp3') && !ext.endsWith('.flac')) {
      setValidationMsg(`Invalid format "${file.name}". Expected WAV, MP3, or FLAC.`);
      return;
    }
    setValidationMsg(`Validated: ${file.name} (${formatFileSize(file.size)})`);
    onUploadNoisy(file);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* AUDIO INPUT PANEL */}
        <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4 xl:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Audio Input
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)]">
                Acquire audio via direct microphone capture or local WAV recording upload.
              </p>
            </div>

            {/* Segmented Mode Switcher */}
            <div className="inline-flex rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-0.5">
              <button
                type="button"
                onClick={() => setInputMode('microphone')}
                className={`rounded-[2px] px-3 py-1 text-[12px] font-medium transition-colors ${
                  inputMode === 'microphone'
                    ? 'bg-[var(--accent)] text-[var(--panel)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Microphone
              </button>
              <button
                type="button"
                onClick={() => setInputMode('upload')}
                className={`rounded-[2px] px-3 py-1 text-[12px] font-medium transition-colors ${
                  inputMode === 'upload'
                    ? 'bg-[var(--accent)] text-[var(--panel)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Upload WAV
              </button>
            </div>
          </div>

          {inputMode === 'microphone' ? (
            <div className="space-y-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isRecording}
                    onClick={onStartRecording}
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--panel)] disabled:opacity-45"
                  >
                    <Mic className="h-3.5 w-3.5" strokeWidth={1.6} />
                    Start Recording
                  </button>
                  <button
                    type="button"
                    disabled={!isRecording}
                    onClick={onStopRecording}
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--error)] bg-[var(--panel)] px-3 py-1.5 text-[12px] font-medium text-[var(--error)] disabled:opacity-40"
                  >
                    <Square className="h-3.5 w-3.5" strokeWidth={1.6} />
                    Stop Recording
                  </button>
                </div>

                <div className="font-mono text-[11px] text-[var(--text-secondary)]">
                  Permission:{' '}
                  <span
                    className={
                      micPermission === 'denied'
                        ? 'text-[var(--error)]'
                        : micPermission === 'granted'
                          ? 'text-[var(--success)]'
                          : 'text-[var(--text-primary)]'
                    }
                  >
                    {micPermission}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="text-[var(--text-secondary)]">Input Level Meter</span>
                    <span className="font-mono tabular-nums text-[var(--text-primary)]">
                      {micLevelDb > -90 ? `${micLevelDb.toFixed(1)} dBFS` : '-inf dBFS'}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-[2px] border border-[var(--border)] bg-[var(--panel)]">
                    <div
                      className="h-full transition-[width] duration-75"
                      style={{
                        width: `${Math.min(100, Math.max(0, micLevelPct))}%`,
                        backgroundColor:
                          micLevelPct > 88 ? 'var(--error)' : 'var(--signal-denoised)',
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[11px]">
                  <span className="text-[var(--text-secondary)]">Recording Duration</span>
                  <span className="font-mono text-[13px] font-medium tabular-nums text-[var(--text-primary)]">
                    {recordingDurationSec.toFixed(1)} s
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleSelectedFile(file);
                }}
                className={`flex flex-col items-center justify-center rounded-[3px] border border-dashed px-4 py-5 text-center transition-colors ${
                  dragActive
                    ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.05]'
                    : 'border-[var(--border)] bg-[var(--bg)]'
                }`}
              >
                <Upload className="h-5 w-5 text-[var(--accent)]" strokeWidth={1.6} />
                <p className="mt-1.5 text-[12.5px] font-medium text-[var(--text-primary)]">
                  Drag and drop WAV audio recording here
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                  Supports WAV, MP3, and FLAC decoded natively via WebAudio PCM
                </p>
                <button
                  type="button"
                  onClick={() => noisyInputRef.current?.click()}
                  className="mt-3 rounded-[3px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11.5px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)]"
                >
                  Browse File
                </button>
                <input
                  ref={noisyInputRef}
                  type="file"
                  accept=".wav,.mp3,.flac,audio/wav"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleSelectedFile(file);
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-[var(--text-primary)]">
                  {activeAudio
                    ? `${activeAudio.name} (${formatFileSize(activeAudio.fileSizeBytes)})`
                    : 'No file selected'}
                </span>
                <span
                  className={
                    validationMsg?.startsWith('Invalid')
                      ? 'text-[var(--error)]'
                      : 'text-[var(--success)]'
                  }
                >
                  {validationMsg ?? (activeAudio ? 'PCM buffer decoded' : 'Awaiting input')}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* AUDIO METADATA SPECIFICATION TABLE */}
        <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4 xl:col-span-5">
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Audio Metadata
          </h2>
          <p className="mb-3 text-[12px] text-[var(--text-secondary)]">
            Measured properties extracted directly from the active PCM buffer.
          </p>

          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] text-[var(--text-secondary)]">
                <th className="py-1.5 font-medium">Parameter</th>
                <th className="py-1.5 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              <tr>
                <td className="py-2 text-[var(--text-secondary)]">Sampling Rate</td>
                <td className="py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {activeAudio ? `${activeAudio.sampleRate.toLocaleString('en-US')} Hz` : '—'}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--text-secondary)]">Duration</td>
                <td className="py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {activeAudio ? `${activeAudio.durationSec.toFixed(3)} s` : '—'}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--text-secondary)]">Channels</td>
                <td className="py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {activeAudio ? activeAudio.channels : '—'}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-[var(--text-secondary)]">Samples</td>
                <td className="py-2 text-right font-mono tabular-nums text-[var(--text-primary)]">
                  {activeAudio ? activeAudio.samples.length.toLocaleString('en-US') : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      {/* COLLAPSIBLE EXPERIMENT CONFIGURATION */}
      <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)]">
        <button
          type="button"
          onClick={() => setScenarioPanelOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div>
            <div className="text-[15px] font-semibold text-[var(--text-primary)]">
              Experiment Configuration
            </div>
            <div className="text-[11.5px] text-[var(--text-secondary)]">
              Active protocol: Scenario {scenario} ·{' '}
              {scenario === 'A'
                ? 'Synthetic Noise (Clean reference available)'
                : scenario === 'B'
                  ? 'Real-world Noise (Estimated SNR only)'
                  : 'Reference Comparison (Aligned recordings)'}
            </div>
          </div>
          {scenarioPanelOpen ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.6} />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.6} />
          )}
        </button>

        {scenarioPanelOpen && (
          <div className="border-t border-[var(--border)] p-4 space-y-3">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              {(
                [
                  { id: 'A', label: 'A. Synthetic Noise' },
                  { id: 'B', label: 'B. Real-world Noise' },
                  { id: 'C', label: 'C. Reference Comparison' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectScenario(tab.id)}
                  className={`rounded-[3px] border px-3 py-1.5 text-left text-[12px] font-medium transition-colors ${
                    scenario === tab.id
                      ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.07] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {scenario === 'A' && (
              <div className="space-y-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3.5 text-[12px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[var(--text-secondary)]">
                    Adds calibrated white noise or 50 Hz mains hum to a clean recording so exact MSE and RMSE can be measured.
                  </p>
                  <span className="font-mono text-[11px] font-medium text-[var(--success)]">
                    Clean Reference Available
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                      Noise Type
                    </label>
                    <select
                      value={syntheticNoiseKind}
                      onChange={(e) =>
                        onChangeSyntheticNoise(e.target.value as SyntheticNoiseKind)
                      }
                      className="w-full rounded-[3px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 text-[12px]"
                    >
                      <option value="white">White Noise</option>
                      <option value="hum50">50 Hz Mains Hum</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
                      Initial SNR (dB)
                    </label>
                    <select
                      value={syntheticSnrDb}
                      onChange={(e) => onChangeSyntheticSnr(Number(e.target.value))}
                      className="w-full rounded-[3px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[12px]"
                    >
                      <option value={0}>0 dB</option>
                      <option value={5}>5 dB</option>
                      <option value={10}>10 dB</option>
                      <option value={15}>15 dB</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={onApplyScenarioA}
                      className="w-full rounded-[3px] border border-[var(--accent)] bg-[var(--panel)] px-3 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--panel)]"
                    >
                      Generate / Mix Scenario A
                    </button>
                  </div>
                </div>
              </div>
            )}

            {scenario === 'B' && (
              <div className="space-y-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3.5 text-[12px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[var(--text-secondary)]">
                    Evaluates real noisy recordings by estimating noise energy from an initial noise-only segment.
                  </p>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-[var(--signal-reference)]">Estimated SNR</span>
                    <span className="text-[var(--text-secondary)]">No Clean Reference</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-[11.5px] text-[var(--text-primary)]">
                      Initial noise-only duration:
                    </label>
                    <input
                      type="number"
                      min={0.2}
                      max={10}
                      step={0.2}
                      value={noiseSegmentSec}
                      onChange={(e) =>
                        onChangeNoiseSegmentSec(Math.max(0.2, Number(e.target.value) || 2.0))
                      }
                      className="w-20 rounded-[3px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[12px]"
                    />
                    <span className="font-mono text-[11px] text-[var(--text-secondary)]">s</span>
                  </div>

                  <button
                    type="button"
                    onClick={onLoadScenarioBSample}
                    className="rounded-[3px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-[11.5px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)]"
                  >
                    Load Sample Noisy Recording
                  </button>
                </div>
              </div>
            )}

            {scenario === 'C' && (
              <div className="space-y-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3.5 text-[12px]">
                <p className="text-[var(--text-secondary)]">
                  Compares two aligned audio recordings where MSE and RMSE serve as comparative indicators only.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => refInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)]"
                  >
                    <Upload className="h-3.5 w-3.5 text-[var(--signal-reference)]" strokeWidth={1.6} />
                    {referenceAudio ? `Reference: ${referenceAudio.name}` : 'Upload Clean Reference WAV'}
                  </button>
                  <input
                    ref={refInputRef}
                    type="file"
                    accept=".wav,.mp3,.flac,audio/wav"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadReference(file);
                      e.target.value = '';
                    }}
                  />
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Note: MSE and RMSE are comparative indicators only.
                  </span>
                </div>

                {/* Collapsible Alignment Options */}
                <div>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)]"
                  >
                    {advancedOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Reference Alignment Settings
                  </button>
                  {advancedOpen && (
                    <div className="mt-2 flex items-center gap-2 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] p-2.5 text-[11px]">
                      <label className="text-[var(--text-secondary)]">Sample Offset Trim:</label>
                      <input
                        type="number"
                        value={alignmentOffsetSamples}
                        onChange={(e) => onChangeAlignmentOffset(Number(e.target.value) || 0)}
                        className="w-24 rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-mono text-[11px]"
                      />
                      <span className="font-mono text-[var(--text-secondary)]">samples</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
