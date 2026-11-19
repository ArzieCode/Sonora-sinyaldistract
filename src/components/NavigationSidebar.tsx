import React from 'react';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Brain,
  Clock,
  Cog,
  GitCompare,
  LayoutGrid,
  Mic,
  Sliders,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import { NavSectionId } from '../types/sonora';

interface NavigationSidebarProps {
  activeNav: NavSectionId;
  onSelectNav: (id: NavSectionId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isRecording: boolean;
  isRunningComparison: boolean;
  isLiveMicSource: boolean;
  hasAudio: boolean;
  blockSize: number;
}

const NAV_GROUPS: Array<{
  group: string;
  items: Array<{
    id: NavSectionId;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }>;
}> = [
  {
    group: 'WORKSPACE',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutGrid },
      { id: 'audio-input', label: 'Audio Input', icon: Mic },
      { id: 'signal-analysis', label: 'Signal Analysis', icon: Waves },
      { id: 'method-comparison', label: 'Method Comparison', icon: GitCompare },
      { id: 'filter-lab', label: 'Filter Laboratory', icon: Activity },
      { id: 'eeg-analysis', label: 'EEG Signal Analysis', icon: Brain },
    ],
  },
  {
    group: 'RESULTS',
    items: [
      { id: 'evaluation-metrics', label: 'Evaluation Metrics', icon: BarChart3 },
      { id: 'audio-playback', label: 'Audio Playback', icon: Volume2 },
      { id: 'cross-domain', label: 'Cross-Domain Compare', icon: ArrowLeftRight },
      { id: 'experiment-history', label: 'Experiment History', icon: Clock },
    ],
  },
  {
    group: 'CONFIGURATION',
    items: [
      { id: 'general-settings', label: 'General Settings', icon: Cog },
      { id: 'processing-settings', label: 'Processing Settings', icon: Sliders },
    ],
  },
];

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activeNav,
  onSelectNav,
  mobileOpen,
  onCloseMobile,
  isRecording,
  isRunningComparison,
  isLiveMicSource,
  hasAudio,
  blockSize,
}) => {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#1E2226]/25 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[258px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)] transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--border)] px-4 py-3.5">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
                SONORA
              </span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">v1.0.0</span>
            </div>
            <div className="mt-0.5 font-mono text-[9.5px] tracking-wider text-[var(--text-secondary)]">
              DIGITAL SIGNAL PROCESSING LAB
            </div>
          </div>

          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-[2px] p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4" aria-label="Laboratory Navigation">
          {NAV_GROUPS.map((section) => (
            <div key={section.group}>
              <div className="mb-1.5 px-2.5 font-mono text-[10px] font-medium tracking-wider text-[var(--text-secondary)]">
                {section.group}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectNav(item.id);
                        onCloseMobile();
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-[2px] border-l-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors whitespace-nowrap ${
                        active
                          ? 'border-[var(--accent)] bg-[#8C3B1F]/[0.07] font-semibold text-[var(--text-primary)]'
                          : 'border-transparent font-normal text-[var(--text-secondary)] hover:bg-[var(--bg)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                        }`}
                        strokeWidth={1.6}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Instrument Status */}
        <div className="border-t border-[var(--border)] bg-[var(--bg)]/60 px-4 py-3 text-[11px]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Audio Engine</span>
              <span
                className={`font-mono text-[10.5px] font-medium ${
                  isRecording
                    ? 'text-[var(--error)]'
                    : isRunningComparison
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--success)]'
                }`}
              >
                {isRecording ? 'Capturing' : isRunningComparison ? 'Processing' : 'Ready'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Input Source</span>
              <span className="font-mono text-[10.5px] text-[var(--text-primary)]">
                {isLiveMicSource ? 'Microphone' : hasAudio ? 'WAV Buffer' : 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">Process Mode</span>
              <span className="font-mono text-[10.5px] tabular-nums text-[var(--text-primary)]">
                Block · {blockSize} samp
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
