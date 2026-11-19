import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PlotlyChart } from './PlotlyChart';
import { designDigitalFilter } from '../dsp/filters';
import { FilterConfig, LabPreferences } from '../types/sonora';

interface FilterLabSectionProps {
  firConfig: FilterConfig;
  iirConfig: FilterConfig;
  sampleRate: number;
  preferences: LabPreferences;
}

export const FilterLabSection: React.FC<FilterLabSectionProps> = ({
  firConfig,
  iirConfig,
  sampleRate,
  preferences,
}) => {
  const [inspectTarget, setInspectTarget] = useState<'iir' | 'fir'>('iir');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const firDesign = useMemo(
    () => designDigitalFilter({ ...firConfig, architecture: 'FIR', sampleRate }),
    [firConfig, sampleRate]
  );

  const iirDesign = useMemo(
    () => designDigitalFilter({ ...iirConfig, architecture: 'IIR', sampleRate }),
    [iirConfig, sampleRate]
  );

  const activeDesign = inspectTarget === 'fir' ? firDesign : iirDesign;

  const unitCircle = useMemo(() => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i <= 180; i++) {
      const th = (i / 180) * 2 * Math.PI;
      x.push(Math.cos(th));
      y.push(Math.sin(th));
    }
    return { x, y };
  }, []);

  return (
    <section className="space-y-4 rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Filter Characteristics &amp; Z-Plane Laboratory
          </h2>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Magnitude frequency response, pole-zero geometry on the unit circle, transfer function H(z), and filter coefficients.
          </p>
        </div>

        <div className="inline-flex rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-0.5">
          <button
            type="button"
            onClick={() => setInspectTarget('iir')}
            className={`rounded-[2px] px-3 py-1 text-[11.5px] font-medium transition-colors ${
              inspectTarget === 'iir'
                ? 'bg-[var(--accent)] text-[var(--panel)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Inspect IIR Butterworth
          </button>
          <button
            type="button"
            onClick={() => setInspectTarget('fir')}
            className={`rounded-[2px] px-3 py-1 text-[11.5px] font-medium transition-colors ${
              inspectTarget === 'fir'
                ? 'bg-[var(--accent)] text-[var(--panel)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Inspect FIR Filter
          </button>
        </div>
      </div>

      {/* Charts Row: Frequency Response + Pole-Zero Diagram */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-[3px] border border-[var(--border)] bg-[var(--bg)]/50 p-3 xl:col-span-7">
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="font-semibold text-[var(--text-primary)]">
              Frequency Response |H(e^jω)|
            </span>
            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
              FIR (solid) · IIR Butterworth (dashed)
            </span>
          </div>

          <PlotlyChart
            height={255}
            showGrid={preferences.showGrid}
            data={[
              {
                x: firDesign.frequencies,
                y: firDesign.magnitudeDb,
                type: 'scatter',
                mode: 'lines',
                name: `FIR (Order ${firDesign.config.order}, fc=${firDesign.config.cutoffHz} Hz)`,
                line: { color: '#1F5A4A', width: 1.5, dash: 'solid' },
              },
              {
                x: iirDesign.frequencies,
                y: iirDesign.magnitudeDb,
                type: 'scatter',
                mode: 'lines',
                name: `IIR (Order ${iirDesign.config.order}, fc=${iirDesign.config.cutoffHz} Hz)`,
                line: { color: '#1F5A4A', width: 1.5, dash: 'dash' },
              },
            ]}
            layout={{
              xaxis: { title: { text: 'Frequency (Hz)', font: { size: 11 } } },
              yaxis: { title: { text: 'Magnitude (dB)', font: { size: 11 } }, range: [-85, 4] },
            }}
          />
        </div>

        <div className="rounded-[3px] border border-[var(--border)] bg-[var(--bg)]/50 p-3 xl:col-span-5">
          <div className="mb-1 flex items-center justify-between text-[12px]">
            <span className="font-semibold text-[var(--text-primary)]">
              Pole-Zero Diagram (z-Plane)
            </span>
            <span
              className={`font-mono text-[11px] font-medium ${
                activeDesign.isStable ? 'text-[var(--success)]' : 'text-[var(--error)]'
              }`}
            >
              {activeDesign.isStable ? 'Stable' : 'Unstable'} · max|p|={activeDesign.maxPoleMagnitude.toFixed(4)}
            </span>
          </div>

          <PlotlyChart
            height={255}
            showGrid={preferences.showGrid}
            data={[
              {
                x: unitCircle.x,
                y: unitCircle.y,
                type: 'scatter',
                mode: 'lines',
                name: 'Unit Circle |z|=1',
                line: { color: '#9A9A93', width: 1.1, dash: 'dash' },
              },
              {
                x: activeDesign.poles.map((p) => p.re),
                y: activeDesign.poles.map((p) => p.im),
                type: 'scatter',
                mode: 'markers',
                name: 'Poles (×)',
                marker: { symbol: 'x', size: 8, color: '#A32A2A' },
              },
              ...(activeDesign.zeros.length > 0
                ? [
                    {
                      x: activeDesign.zeros.map((z) => z.re),
                      y: activeDesign.zeros.map((z) => z.im),
                      type: 'scatter' as const,
                      mode: 'markers' as const,
                      name: 'Zeros (○)',
                      marker: {
                        symbol: 'circle-open',
                        size: 8,
                        color: '#1F5A4A',
                        line: { width: 1.8 },
                      },
                    },
                  ]
                : []),
            ]}
            layout={{
              xaxis: {
                title: { text: 'Re(z)', font: { size: 11 } },
                range: [-1.3, 1.3],
                scaleanchor: 'y',
                scaleratio: 1,
              },
              yaxis: {
                title: { text: 'Im(z)', font: { size: 11 } },
                range: [-1.3, 1.3],
              },
            }}
          />
        </div>
      </div>

      {/* Filter Summary Metadata Strip */}
      <div className="grid grid-cols-2 gap-3 rounded-[3px] border border-[var(--border)] bg-[var(--bg)] p-3 text-[11.5px] sm:grid-cols-4">
        <div>
          <span className="text-[var(--text-secondary)]">Architecture: </span>
          <span className="font-mono font-medium text-[var(--text-primary)]">
            {activeDesign.config.architecture} ({activeDesign.config.type})
          </span>
        </div>
        <div>
          <span className="text-[var(--text-secondary)]">Order: </span>
          <span className="font-mono font-medium text-[var(--text-primary)]">
            {activeDesign.config.order}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-secondary)]">Cutoff: </span>
          <span className="font-mono font-medium text-[var(--text-primary)]">
            {activeDesign.config.cutoffHz} Hz
            {activeDesign.config.type === 'bandpass' || activeDesign.config.type === 'bandstop'
              ? ` – ${activeDesign.config.cutoffHighHz} Hz`
              : ''}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-secondary)]">Sampling Rate: </span>
          <span className="font-mono font-medium text-[var(--text-primary)]">
            {sampleRate.toLocaleString('en-US')} Hz
          </span>
        </div>
      </div>

      {/* Collapsible Technical Details: H(z), Pole-Zero Coordinates, Coefficients */}
      <div className="rounded-[3px] border border-[var(--border)] bg-[var(--bg)]">
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[12px] font-medium text-[var(--text-primary)]"
        >
          <span>
            Technical Details: Transfer Function H(z), Pole/Zero Coordinates &amp; Coefficients
          </span>
          {detailsOpen ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-secondary)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
          )}
        </button>

        {detailsOpen && (
          <div className="space-y-4 border-t border-[var(--border)] p-3.5">
            <div>
              <div className="mb-1 text-[11px] font-medium text-[var(--text-secondary)]">
                Transfer Function H(z) &amp; Difference Equation
              </div>
              <div className="rounded-[2px] border border-[var(--border)] bg-[var(--panel)] p-2.5 font-mono text-[11px] text-[var(--text-primary)]">
                <div>H(z) = Y(z)/X(z) = (Σ b[k]·z⁻ᵏ) / (1 + Σ a[m]·z⁻ᵐ)</div>
                <div className="mt-1 break-all text-[var(--signal-denoised)]">
                  {activeDesign.differenceEquation}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-medium text-[var(--text-secondary)]">
                  Filter Coefficients (b[k], a[k])
                </div>
                <div className="max-h-48 overflow-y-auto rounded-[2px] border border-[var(--border)] bg-[var(--panel)]">
                  <table className="w-full text-left font-mono text-[11px] tabular-nums">
                    <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="px-2.5 py-1.5 font-medium">k</th>
                        <th className="px-2.5 py-1.5 font-medium">b[k]</th>
                        <th className="px-2.5 py-1.5 font-medium">a[k]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {Array.from({
                        length: Math.max(activeDesign.b.length, activeDesign.a.length),
                      }).map((_, k) => (
                        <tr key={k}>
                          <td className="px-2.5 py-1 text-[var(--text-secondary)]">{k}</td>
                          <td className="px-2.5 py-1">
                            {activeDesign.b[k] !== undefined
                              ? activeDesign.b[k].toExponential(5)
                              : '—'}
                          </td>
                          <td className="px-2.5 py-1">
                            {activeDesign.a[k] !== undefined
                              ? activeDesign.a[k].toExponential(5)
                              : '0.00000e+0'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-medium text-[var(--text-secondary)]">
                  Numerical Pole Coordinates (z-plane)
                </div>
                <div className="max-h-48 overflow-y-auto rounded-[2px] border border-[var(--border)] bg-[var(--panel)]">
                  <table className="w-full text-left font-mono text-[11px] tabular-nums">
                    <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="px-2.5 py-1.5 font-medium">Pole</th>
                        <th className="px-2.5 py-1.5 font-medium">Re(z)</th>
                        <th className="px-2.5 py-1.5 font-medium">Im(z)</th>
                        <th className="px-2.5 py-1.5 text-right font-medium">|z|</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {activeDesign.poles.slice(0, 16).map((p, idx) => (
                        <tr key={idx}>
                          <td className="px-2.5 py-1 text-[var(--text-secondary)]">p{idx + 1}</td>
                          <td className="px-2.5 py-1">{p.re.toFixed(5)}</td>
                          <td className="px-2.5 py-1">{p.im.toFixed(5)}</td>
                          <td className="px-2.5 py-1 text-right">
                            {Math.hypot(p.re, p.im).toFixed(5)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
