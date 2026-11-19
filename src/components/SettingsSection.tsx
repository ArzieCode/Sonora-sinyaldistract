import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LabPreferences } from '../types/sonora';

interface SettingsSectionProps {
  mode: 'general' | 'processing';
  preferences: LabPreferences;
  onUpdatePreferences: (patch: Partial<LabPreferences>) => void;
  onApplyDefaultsToWorkspace: () => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  mode,
  preferences,
  onUpdatePreferences,
  onApplyDefaultsToWorkspace,
}) => {
  const [openGroup, setOpenGroup] = useState<'GENERAL' | 'PROCESSING' | 'VISUALIZATION' | 'ADVANCED'>(
    mode === 'general' ? 'GENERAL' : 'PROCESSING'
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const toggle = (g: typeof openGroup) => {
    setOpenGroup((curr) => (curr === g ? g : g));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {mode === 'general'
              ? 'General & Visualization Settings'
              : 'Processing & Advanced Parameters'}
          </h2>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Configure default laboratory instrument parameters without cluttering the primary analysis workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            onApplyDefaultsToWorkspace();
            setSavedNotice('Default laboratory parameters applied to active workspace.');
            setTimeout(() => setSavedNotice(null), 3500);
          }}
          className="rounded-[3px] border border-[var(--accent)] bg-[var(--accent)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--panel)]"
        >
          Apply Defaults to Active Session
        </button>
      </div>

      {savedNotice && (
        <div className="rounded-[3px] border border-[var(--success)] bg-[var(--panel)] px-3.5 py-2 text-[12px] text-[var(--success)]">
          {savedNotice}
        </div>
      )}

      {/* GENERAL ACCORDION */}
      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)]">
        <button
          type="button"
          onClick={() => toggle('GENERAL')}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]"
        >
          <span>GENERAL</span>
          {openGroup === 'GENERAL' ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
          )}
        </button>

        {openGroup === 'GENERAL' && (
          <div className="grid grid-cols-1 gap-4 border-t border-[var(--border)] p-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Default Sampling Rate
              </label>
              <select
                value={preferences.defaultSampleRate}
                onChange={(e) =>
                  onUpdatePreferences({ defaultSampleRate: Number(e.target.value) })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              >
                <option value={8000}>8,000 Hz</option>
                <option value={16000}>16,000 Hz</option>
                <option value={44100}>44,100 Hz</option>
                <option value={48000}>48,000 Hz</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Default Block Size (samples)
              </label>
              <select
                value={preferences.defaultBlockSize}
                onChange={(e) =>
                  onUpdatePreferences({ defaultBlockSize: Number(e.target.value) })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              >
                <option value={256}>256 samples</option>
                <option value={512}>512 samples</option>
                <option value={1024}>1024 samples</option>
                <option value={2048}>2048 samples</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Default Visualization Scale
              </label>
              <select
                value={preferences.fftScale}
                onChange={(e) =>
                  onUpdatePreferences({ fftScale: e.target.value as 'linear' | 'log' })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[12px]"
              >
                <option value="linear">Linear Frequency Axis (Hz)</option>
                <option value="log">Logarithmic Frequency Axis (Hz)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* PROCESSING ACCORDION */}
      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)]">
        <button
          type="button"
          onClick={() => toggle('PROCESSING')}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]"
        >
          <span>PROCESSING</span>
          {openGroup === 'PROCESSING' ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
          )}
        </button>

        {openGroup === 'PROCESSING' && (
          <div className="grid grid-cols-1 gap-4 border-t border-[var(--border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Default FIR Order
              </label>
              <input
                type="number"
                min={8}
                max={128}
                step={2}
                value={preferences.defaultFirOrder}
                onChange={(e) =>
                  onUpdatePreferences({ defaultFirOrder: Number(e.target.value) || 48 })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Default IIR Order
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={preferences.defaultIirOrder}
                onChange={(e) =>
                  onUpdatePreferences({ defaultIirOrder: Number(e.target.value) || 4 })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Default STFT Frame Size
              </label>
              <select
                value={preferences.defaultFrameSize}
                onChange={(e) =>
                  onUpdatePreferences({
                    defaultFrameSize: Number(e.target.value) as LabPreferences['defaultFrameSize'],
                  })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              >
                <option value={256}>256</option>
                <option value={512}>512</option>
                <option value={1024}>1024</option>
                <option value={2048}>2048</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Default Overlap
              </label>
              <select
                value={preferences.defaultOverlapRatio}
                onChange={(e) =>
                  onUpdatePreferences({
                    defaultOverlapRatio: Number(e.target.value) as 0.5 | 0.75,
                  })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              >
                <option value={0.5}>50%</option>
                <option value={0.75}>75%</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* VISUALIZATION ACCORDION */}
      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)]">
        <button
          type="button"
          onClick={() => toggle('VISUALIZATION')}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]"
        >
          <span>VISUALIZATION</span>
          {openGroup === 'VISUALIZATION' ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
          )}
        </button>

        {openGroup === 'VISUALIZATION' && (
          <div className="grid grid-cols-1 gap-4 border-t border-[var(--border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Waveform Display Mode
              </label>
              <select
                value={preferences.waveformDisplayMode}
                onChange={(e) =>
                  onUpdatePreferences({
                    waveformDisplayMode: e.target.value as 'overlay' | 'individual',
                  })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[12px]"
              >
                <option value="overlay">Overlay Comparison</option>
                <option value="individual">Individual Traces</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Spectrogram Min (dBFS)
              </label>
              <input
                type="number"
                min={-120}
                max={-40}
                value={preferences.spectrogramRangeMin}
                onChange={(e) =>
                  onUpdatePreferences({ spectrogramRangeMin: Number(e.target.value) || -95 })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Spectrogram Max (dBFS)
              </label>
              <input
                type="number"
                min={-30}
                max={0}
                value={preferences.spectrogramRangeMax}
                onChange={(e) =>
                  onUpdatePreferences({ spectrogramRangeMax: Number(e.target.value) || -10 })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={preferences.showGrid}
                  onChange={(e) => onUpdatePreferences({ showGrid: e.target.checked })}
                  className="accent-[var(--accent)]"
                />
                <span>Show Chart Gridlines</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ADVANCED ACCORDION */}
      <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)]">
        <button
          type="button"
          onClick={() => toggle('ADVANCED')}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold text-[var(--text-primary)]"
        >
          <span>ADVANCED</span>
          {openGroup === 'ADVANCED' ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
          )}
        </button>

        {openGroup === 'ADVANCED' && (
          <div className="grid grid-cols-1 gap-4 border-t border-[var(--border)] p-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Numerical Precision (Decimal Places)
              </label>
              <select
                value={preferences.numericalPrecision}
                onChange={(e) =>
                  onUpdatePreferences({
                    numericalPrecision: Number(e.target.value) as 2 | 3 | 4,
                  })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[12px]"
              >
                <option value={2}>2 decimal places</option>
                <option value={3}>3 decimal places</option>
                <option value={4}>4 decimal places</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Audio Channel Handling
              </label>
              <select
                value={preferences.channelHandling}
                onChange={(e) =>
                  onUpdatePreferences({
                    channelHandling: e.target.value as 'mono-mix' | 'left-only',
                  })
                }
                className="w-full rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[12px]"
              >
                <option value="mono-mix">Stereo-to-Mono Average Mixdown</option>
                <option value="left-only">Channel 0 (Left) Only</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] text-[var(--text-secondary)]">
                Processing Engine Architecture
              </label>
              <div className="rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
                Client WebAudio Float32 DSP
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
