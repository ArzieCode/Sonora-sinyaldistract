import React from 'react';
import { SessionRunEntry } from '../types/sonora';

interface ExperimentHistorySectionProps {
  runs: SessionRunEntry[];
  onClearHistory: () => void;
}

export const ExperimentHistorySection: React.FC<ExperimentHistorySectionProps> = ({
  runs,
  onClearHistory,
}) => {
  return (
    <section className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Experiment History (Current Session Log)
          </h2>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Chronological log of 3-method comparisons executed in this browser session (in-memory, no external database).
          </p>
        </div>

        {runs.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="rounded-[3px] border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] hover:border-[var(--error)] hover:text-[var(--error)]"
          >
            Clear Session Log
          </button>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="flex h-36 items-center justify-center rounded-[3px] border border-dashed border-[var(--border)] bg-[var(--bg)] text-[12px] text-[var(--text-secondary)]">
          No comparison runs logged yet. Click &ldquo;RUN COMPARISON&rdquo; to record your first experiment run.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]/70 text-[var(--text-secondary)]">
                <th className="px-2.5 py-2 font-semibold">Run ID</th>
                <th className="px-2.5 py-2 font-semibold">Timestamp</th>
                <th className="px-2.5 py-2 font-semibold">Dataset</th>
                <th className="px-2.5 py-2 font-semibold">Scenario</th>
                <th className="px-2.5 py-2 text-right font-semibold">Fs (Hz)</th>
                <th className="px-2.5 py-2 text-right font-semibold">Block (samp)</th>
                <th className="px-2.5 py-2 font-semibold">Highest Output SNR Method</th>
                <th className="px-2.5 py-2 text-right font-semibold">Best SNR (dB)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-[var(--bg)]/50">
                  <td className="px-2.5 py-2 font-medium text-[var(--text-primary)]">{run.id}</td>
                  <td className="px-2.5 py-2 text-[var(--text-secondary)]">
                    {new Date(run.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-2.5 py-2 font-sans text-[var(--text-primary)]">
                    {run.datasetName}
                  </td>
                  <td className="px-2.5 py-2">Scenario {run.scenario}</td>
                  <td className="px-2.5 py-2 text-right">
                    {run.sampleRate.toLocaleString('en-US')}
                  </td>
                  <td className="px-2.5 py-2 text-right">{run.blockSize}</td>
                  <td className="px-2.5 py-2 font-sans text-[var(--text-primary)]">
                    {run.bestSnrMethod}
                  </td>
                  <td className="px-2.5 py-2 text-right font-semibold text-[var(--signal-denoised)]">
                    {run.bestOutputSnrDb !== null
                      ? `${run.bestOutputSnrDb.toFixed(2)}${run.snrIsEstimate ? ' (Est.)' : ''}`
                      : 'Not Available'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
