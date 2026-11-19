import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Play } from 'lucide-react';
import { designDigitalFilter } from '../dsp/filters';
import { SpectralSubtractionConfig } from '../dsp/spectralSubtraction';
import { AudioSignalData, FilterConfig } from '../types/sonora';

export type MethodTabId = 'fir' | 'iir' | 'spectral';

interface MethodConfigPanelProps {
  activeAudio: AudioSignalData | null;
  activeMethodTab: MethodTabId;
  firConfig: FilterConfig;
  iirConfig: FilterConfig;
  spectralConfig: SpectralSubtractionConfig;
  blockSize: number;
  isRecording: boolean;
  isRunningComparison: boolean;
  lastStatusText: string;
  onChangeMethodTab: (tab: MethodTabId) => void;
  onUpdateFir: (patch: Partial<FilterConfig>) => void;
  onUpdateIir: (patch: Partial<FilterConfig>) => void;
  onUpdateSpectral: (patch: Partial<SpectralSubtractionConfig>) => void;
  onChangeBlockSize: (size: number) => void;
  onRunComparison: () => void;
}

export const MethodConfigPanel: React.FC<MethodConfigPanelProps> = ({
  activeAudio,
  activeMethodTab,
  firConfig,
  iirConfig,
  spectralConfig,
  blockSize,
  isRecording,
  isRunningComparison,
  lastStatusText,
  onChangeMethodTab,
  onUpdateFir,
  onUpdateIir,
  onUpdateSpectral,
  onChangeBlockSize,
  onRunComparison,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const sampleRate = activeAudio?.sampleRate ?? firConfig.sampleRate;
  const nyquist = Math.floor(sampleRate / 2);

  const firPreview = useMemo(
    () => designDigitalFilter({ ...firConfig, architecture: 'FIR', sampleRate }),
    [firConfig, sampleRate]
  );

  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Method Configuration
          </h2>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Configure FIR Filter, IIR Butterworth, Spectral Subtraction, and block processing size.
          </p>
        </div>

        {/* Global Block Size */}
        <div className="flex items-center gap-2 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[12px]">
          <label className="text-[var(--text-secondary)]" title="Number of samples processed per block">
            Block Size:
          </label>
          <select
            value={blockSize}
            onChange={(e) => onChangeBlockSize(Number(e.target.value))}
            className="rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 font-mono text-[12px] text-[var(--text-primary)]"
          >
            <option value={256}>256</option>
            <option value={512}>512</option>
            <option value={1024}>1024</option>
            <option value={2048}>2048</option>
            <option value={4096}>4096</option>
          </select>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">samples</span>
        </div>
      </div>

      {/* Method Tabs */}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-0.5">
        {(
          [
            { id: 'fir', label: 'FIR Filter' },
            { id: 'iir', label: 'IIR Butterworth' },
            { id: 'spectral', label: 'Spectral Subtraction' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChangeMethodTab(tab.id)}
            className={`rounded-[2px] py-1.5 text-[12px] font-medium transition-colors ${
              activeMethodTab === tab.id
                ? 'bg-[var(--accent)] text-[var(--panel)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeMethodTab === 'fir' && (
        <div className="grid grid-cols-1 gap-4 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3.5 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Filter Order (even taps - 1)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={8}
                max={128}
                step={2}
                value={firConfig.order}
                onChange={(e) =>
                  onUpdateFir({ order: Math.max(8, Math.min(128, Number(e.target.value) || 48)) })
                }
                className="w-24 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[12px]"
              />
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">order</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Window Type
            </label>
            <select
              value={firConfig.windowType}
              onChange={(e) =>
                onUpdateFir({ windowType: e.target.value as FilterConfig['windowType'] })
              }
              className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-[12px] capitalize"
            >
              <option value="hamming">Hamming</option>
              <option value="hann">Hann</option>
              <option value="blackman">Blackman</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              {firConfig.type === 'bandpass' || firConfig.type === 'bandstop'
                ? 'Lower / Upper Cutoff'
                : 'Cutoff Frequency'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={20}
                max={nyquist - 20}
                step={10}
                value={firConfig.cutoffHz}
                onChange={(e) =>
                  onUpdateFir({
                    cutoffHz: Math.max(20, Math.min(nyquist - 20, Number(e.target.value) || 1000)),
                  })
                }
                className="w-24 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[12px]"
              />
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">Hz</span>
            </div>
          </div>
        </div>
      )}

      {activeMethodTab === 'iir' && (
        <div className="grid grid-cols-1 gap-4 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3.5 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Filter Order
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={8}
                value={iirConfig.order}
                onChange={(e) =>
                  onUpdateIir({ order: Math.max(1, Math.min(8, Number(e.target.value) || 4)) })
                }
                className="w-24 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[12px]"
              />
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">poles</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Filter Type
            </label>
            <select
              value={iirConfig.type}
              onChange={(e) => onUpdateIir({ type: e.target.value as FilterConfig['type'] })}
              className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-[12px]"
            >
              <option value="bandpass">Band-pass</option>
              <option value="highpass">High-pass</option>
              <option value="bandstop">Band-stop</option>
              <option value="lowpass">Low-pass</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              {iirConfig.type === 'bandpass' || iirConfig.type === 'bandstop'
                ? 'Cutoff f₁ / f₂ (Hz)'
                : 'Cutoff Frequency (Hz)'}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={15}
                max={nyquist - 30}
                step={10}
                value={iirConfig.cutoffHz}
                onChange={(e) =>
                  onUpdateIir({
                    cutoffHz: Math.max(15, Math.min(nyquist - 30, Number(e.target.value) || 120)),
                  })
                }
                className="w-20 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[12px]"
              />
              {(iirConfig.type === 'bandpass' || iirConfig.type === 'bandstop') && (
                <>
                  <span className="text-[11px] text-[var(--text-secondary)]">–</span>
                  <input
                    type="number"
                    min={iirConfig.cutoffHz + 20}
                    max={nyquist - 10}
                    step={10}
                    value={iirConfig.cutoffHighHz}
                    onChange={(e) =>
                      onUpdateIir({
                        cutoffHighHz: Math.max(
                          iirConfig.cutoffHz + 20,
                          Number(e.target.value) || 1400
                        ),
                      })
                    }
                    className="w-20 rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[12px]"
                  />
                </>
              )}
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">Hz</span>
            </div>
          </div>
        </div>
      )}

      {activeMethodTab === 'spectral' && (
        <div className="grid grid-cols-1 gap-4 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Frame Size
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={spectralConfig.frameSize}
                onChange={(e) =>
                  onUpdateSpectral({
                    frameSize: Number(e.target.value) as SpectralSubtractionConfig['frameSize'],
                  })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[12px]"
              >
                <option value={256}>256</option>
                <option value={512}>512</option>
                <option value={1024}>1024</option>
                <option value={2048}>2048</option>
              </select>
              <span className="font-mono text-[11px] text-[var(--text-secondary)]">samp</span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Overlap
            </label>
            <select
              value={spectralConfig.overlapRatio}
              onChange={(e) =>
                onUpdateSpectral({ overlapRatio: Number(e.target.value) as 0.5 | 0.75 })
              }
              className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 font-mono text-[12px]"
            >
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Reduction Factor (α)
            </label>
            <input
              type="number"
              min={0.5}
              max={4.0}
              step={0.1}
              value={spectralConfig.subtractionFactor}
              onChange={(e) =>
                onUpdateSpectral({
                  subtractionFactor: Math.max(0.5, Math.min(4.0, Number(e.target.value) || 1.8)),
                })
              }
              className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[12px]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-[var(--text-secondary)]">
              Noise Estimation Source
            </label>
            <select
              value={spectralConfig.noiseSource}
              onChange={(e) =>
                onUpdateSpectral({
                  noiseSource: e.target.value as SpectralSubtractionConfig['noiseSource'],
                })
              }
              className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[12px]"
            >
              <option value="initial-segment">Initial noise-only segment</option>
              <option value="minimum-percentile">Minimum percentile floor</option>
            </select>
          </div>
        </div>
      )}

      {/* Collapsible Advanced Parameters */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {advancedOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Advanced Parameters
        </button>

        {advancedOpen && (
          <div className="mt-2 grid grid-cols-1 gap-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3 text-[11.5px] md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">FIR Response Type:</span>
                <select
                  value={firConfig.type}
                  onChange={(e) =>
                    onUpdateFir({ type: e.target.value as FilterConfig['type'] })
                  }
                  className="rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11.5px]"
                >
                  <option value="lowpass">Low-pass</option>
                  <option value="highpass">High-pass</option>
                  <option value="bandpass">Band-pass</option>
                  <option value="bandstop">Band-stop</option>
                </select>
              </div>
              <label className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Zero-Phase Filtering (filtfilt):</span>
                <input
                  type="checkbox"
                  checked={firConfig.zeroPhase}
                  onChange={(e) => {
                    onUpdateFir({ zeroPhase: e.target.checked });
                    onUpdateIir({ zeroPhase: e.target.checked });
                  }}
                  className="accent-[var(--accent)]"
                />
              </label>
            </div>

            <div>
              <div className="mb-1 text-[var(--text-secondary)]">
                FIR Coefficients Preview (b[0..5] of {firPreview.b.length} taps):
              </div>
              <div className="rounded-[2px] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[10.5px] text-[var(--text-primary)]">
                [{firPreview.b.slice(0, 6).map((v) => v.toFixed(4)).join(', ')} …]
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary Action & Status Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
        <div className="text-[11.5px] text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Status:</span>{' '}
          <span>{lastStatusText}</span>
        </div>

        <button
          type="button"
          disabled={!activeAudio || isRecording || isRunningComparison}
          onClick={onRunComparison}
          className="inline-flex items-center gap-2 rounded-[3px] border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 font-mono text-[12px] font-semibold tracking-wide text-[var(--panel)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
        >
          <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
          {isRunningComparison ? 'PROCESSING…' : 'RUN COMPARISON'}
        </button>
      </div>
    </section>
  );
};
