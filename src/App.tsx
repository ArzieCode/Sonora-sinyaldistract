import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, Settings } from 'lucide-react';
import { AudioInputSection } from './components/AudioInputSection';
import { CrossDomainSection } from './components/CrossDomainSection';
import { EegAnalysisSection } from './components/EegAnalysisSection';
import { EvaluationAndOutputSection } from './components/EvaluationAndOutputSection';
import { ExperimentHistorySection } from './components/ExperimentHistorySection';
import { FilterLabSection } from './components/FilterLabSection';
import { MethodConfigPanel, MethodTabId } from './components/MethodConfigPanel';
import { NavigationSidebar } from './components/NavigationSidebar';
import { SettingsSection } from './components/SettingsSection';
import { SignalMonitorSection } from './components/SignalMonitorSection';
import { decodeAudioFile, encodeWavBlob } from './dsp/audioUtils';
import {
  MethodComparisonResult,
  runThreeMethodComparison,
} from './dsp/blockProcessor';
import { EegDataset, EegEvaluationRow, EegProcessingOutput } from './dsp/eegOffline';
import { fftRadix2, getWindowCoefficients } from './dsp/fft';
import {
  buildScenarioAPair,
  buildScenarioBDemoSignal,
  DataScenario,
  SyntheticNoiseKind,
} from './dsp/scenarios';
import { SpectralSubtractionConfig } from './dsp/spectralSubtraction';
import {
  AudioSignalData,
  FilterConfig,
  LabPreferences,
  NavSectionId,
  SessionRunEntry,
} from './types/sonora';

const NAV_META: Record<NavSectionId, { group: string; title: string }> = {
  overview: { group: 'WORKSPACE', title: 'Overview' },
  'audio-input': { group: 'WORKSPACE', title: 'Audio Input' },
  'signal-analysis': { group: 'WORKSPACE', title: 'Signal Analysis' },
  'method-comparison': { group: 'WORKSPACE', title: 'Method Comparison' },
  'filter-lab': { group: 'WORKSPACE', title: 'Filter Laboratory' },
  'eeg-analysis': { group: 'WORKSPACE', title: 'EEG Signal Analysis' },
  'evaluation-metrics': { group: 'RESULTS', title: 'Evaluation Metrics' },
  'audio-playback': { group: 'RESULTS', title: 'Audio Playback' },
  'cross-domain': { group: 'RESULTS', title: 'Cross-Domain Comparison' },
  'experiment-history': { group: 'RESULTS', title: 'Experiment History' },
  'general-settings': { group: 'CONFIGURATION', title: 'General Settings' },
  'processing-settings': { group: 'CONFIGURATION', title: 'Processing Settings' },
};

export default function App() {
  const [activeNav, setActiveNav] = useState<NavSectionId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [preferences, setPreferences] = useState<LabPreferences>({
    defaultSampleRate: 16000,
    defaultBlockSize: 1024,
    defaultFirOrder: 48,
    defaultIirOrder: 4,
    defaultFrameSize: 512,
    defaultOverlapRatio: 0.5,
    waveformDisplayMode: 'overlay',
    fftScale: 'linear',
    spectrogramRangeMin: -95,
    spectrogramRangeMax: -10,
    showGrid: true,
    numericalPrecision: 2,
    channelHandling: 'mono-mix',
  });

  // Scenario & signal state
  const [scenario, setScenario] = useState<DataScenario>('A');
  const [syntheticNoiseKind, setSyntheticNoiseKind] = useState<SyntheticNoiseKind>('white');
  const [syntheticSnrDb, setSyntheticSnrDb] = useState<number>(10);
  const [noiseSegmentSec, setNoiseSegmentSec] = useState<number>(2.0);
  const [alignmentOffsetSamples, setAlignmentOffsetSamples] = useState<number>(0);

  const [noisyAudio, setNoisyAudio] = useState<AudioSignalData | null>(null);
  const [referenceAudio, setReferenceAudio] = useState<AudioSignalData | null>(null);
  const [cleanBaseAudio, setCleanBaseAudio] = useState<AudioSignalData | null>(null);
  const [isLiveMicSource, setIsLiveMicSource] = useState<boolean>(false);

  // Microphone live capture state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingDurationSec, setRecordingDurationSec] = useState<number>(0);
  const [micLevelDb, setMicLevelDb] = useState<number>(-96);
  const [micLevelPct, setMicLevelPct] = useState<number>(0);
  const [micPermission, setMicPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [liveTimeDomain, setLiveTimeDomain] = useState<number[]>([]);
  const [liveFftDb, setLiveFftDb] = useState<{ freqs: number[]; db: number[] } | null>(null);

  // Method configuration state (preserving existing filterConfig/spectralConfig structure)
  const [activeMethodTab, setActiveMethodTab] = useState<MethodTabId>('fir');
  const [blockSize, setBlockSize] = useState<number>(1024);

  const [firConfig, setFirConfig] = useState<FilterConfig>({
    architecture: 'FIR',
    type: 'lowpass',
    cutoffHz: 1200,
    cutoffHighHz: 3400,
    order: 48,
    sampleRate: 16000,
    windowType: 'hamming',
    zeroPhase: true,
  });

  const [iirConfig, setIirConfig] = useState<FilterConfig>({
    architecture: 'IIR',
    type: 'bandpass',
    cutoffHz: 120,
    cutoffHighHz: 1400,
    order: 4,
    sampleRate: 16000,
    windowType: 'hann',
    zeroPhase: true,
  });

  const [spectralConfig, setSpectralConfig] = useState<SpectralSubtractionConfig>({
    frameSize: 512,
    overlapRatio: 0.5,
    subtractionFactor: 1.8,
    noiseSource: 'initial-segment',
    noiseSegmentSec: 2.0,
  });

  // Comparison results, session history & playback marker
  const [results, setResults] = useState<MethodComparisonResult[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionRunEntry[]>([]);
  const [isRunningComparison, setIsRunningComparison] = useState<boolean>(false);
  const [playbackTimeSec, setPlaybackTimeSec] = useState<number | null>(null);
  const [lastStatusText, setLastStatusText] = useState<string>(
    'Ready — Scenario A loaded (white noise, 10 dB SNR).'
  );

  // Offline EEG module state (isolated from audio DSP pipeline)
  const [eegDataset, setEegDataset] = useState<EegDataset | null>(null);
  const [eegOutput, setEegOutput] = useState<EegProcessingOutput | null>(null);
  const [eegHistoryRows, setEegHistoryRows] = useState<EegEvaluationRow[]>([]);

  // WebAudio microphone refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micChunksRef = useRef<Float32Array[]>([]);
  const micRafRef = useRef<number | null>(null);
  const micStartTimeRef = useRef<number>(0);

  // Initialize Scenario A on mount so laboratory plots display real signal data immediately
  useEffect(() => {
    const initial = buildScenarioAPair('white', 10);
    setNoisyAudio(initial.noisy);
    setReferenceAudio(initial.cleanReference);
    setCleanBaseAudio(initial.cleanReference);
    setIsLiveMicSource(false);
  }, []);

  const syncSampleRateConfigs = useCallback((fs: number) => {
    const nyq = Math.floor(fs / 2);
    setFirConfig((prev) => ({
      ...prev,
      sampleRate: fs,
      cutoffHz: Math.min(prev.cutoffHz, Math.floor(nyq * 0.85)),
      cutoffHighHz: Math.min(prev.cutoffHighHz, Math.floor(nyq * 0.92)),
    }));
    setIirConfig((prev) => ({
      ...prev,
      sampleRate: fs,
      cutoffHz: Math.min(prev.cutoffHz, Math.floor(nyq * 0.85)),
      cutoffHighHz: Math.min(prev.cutoffHighHz, Math.floor(nyq * 0.92)),
    }));
  }, []);

  const handleStartRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setLastStatusText('Browser does not support MediaDevices microphone capture.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      setMicPermission('granted');

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;

      const processor = ctx.createScriptProcessor(2048, 1, 1);
      micChunksRef.current = [];
      processor.onaudioprocess = (ev) => {
        const inputData = ev.inputBuffer.getChannelData(0);
        micChunksRef.current.push(new Float32Array(inputData));
      };

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(ctx.destination);

      micStreamRef.current = stream;
      micCtxRef.current = ctx;
      micStartTimeRef.current = performance.now();
      setIsRecording(true);
      setResults([]);
      setPlaybackTimeSec(null);
      setLastStatusText(`Recording live microphone signal at ${ctx.sampleRate} Hz…`);

      const timeBuf = new Float32Array(analyser.fftSize);
      const fftRe = new Float64Array(analyser.fftSize);
      const fftIm = new Float64Array(analyser.fftSize);
      const win = getWindowCoefficients(analyser.fftSize, 'hann');
      const half = analyser.fftSize >> 1;
      const freqs = Array.from(
        { length: half + 1 },
        (_, k) => (k * ctx.sampleRate) / analyser.fftSize
      );

      const updateLive = () => {
        analyser.getFloatTimeDomainData(timeBuf);
        let sumSq = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          sumSq += timeBuf[i] * timeBuf[i];
        }
        const rms = Math.sqrt(sumSq / timeBuf.length);
        const db = 20 * Math.log10(Math.max(rms, 1e-5));
        setMicLevelDb(db);
        setMicLevelPct(Math.max(0, Math.min(100, ((db + 60) / 60) * 100)));
        setRecordingDurationSec((performance.now() - micStartTimeRef.current) / 1000);
        setLiveTimeDomain(Array.from(timeBuf));

        fftRe.fill(0);
        fftIm.fill(0);
        for (let i = 0; i < analyser.fftSize; i++) {
          fftRe[i] = timeBuf[i] * win[i];
        }
        fftRadix2(fftRe, fftIm);
        const dbBins = new Array<number>(half + 1);
        for (let k = 0; k <= half; k++) {
          const mag = (Math.hypot(fftRe[k], fftIm[k]) * 2) / analyser.fftSize;
          dbBins[k] = 20 * Math.log10(Math.max(mag, 1e-6));
        }
        setLiveFftDb({ freqs, db: dbBins });

        micRafRef.current = requestAnimationFrame(updateLive);
      };

      micRafRef.current = requestAnimationFrame(updateLive);
    } catch (err) {
      setMicPermission('denied');
      setLastStatusText(
        err instanceof Error
          ? `Microphone error: ${err.message}`
          : 'Microphone permission denied or unavailable.'
      );
    }
  };

  const handleStopRecording = async () => {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    const stream = micStreamRef.current;
    const ctx = micCtxRef.current;
    const fs = ctx?.sampleRate ?? 44100;

    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (ctx) await ctx.close().catch(() => undefined);

    const chunks = micChunksRef.current;
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Float32Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    setIsRecording(false);
    setMicLevelDb(-96);
    setMicLevelPct(0);

    if (totalLen < 256) {
      setLastStatusText('Microphone capture too short. Record at least 0.5 seconds.');
      return;
    }

    const wavBlob = encodeWavBlob([combined], fs);
    const recorded: AudioSignalData = {
      id: `mic-${Date.now()}`,
      name: `mic_capture_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.wav`,
      format: 'WAV',
      fileSizeBytes: wavBlob.size,
      durationSec: totalLen / fs,
      sampleRate: fs,
      channels: 1,
      samples: combined,
      channelBuffers: [combined],
      blobUrl: URL.createObjectURL(wavBlob),
      isDemoData: false,
      loadedAt: new Date().toISOString(),
    };

    setNoisyAudio(recorded);
    setIsLiveMicSource(true);
    setReferenceAudio(scenario === 'C' ? referenceAudio : null);
    if (scenario === 'A') setScenario('B');
    syncSampleRateConfigs(fs);
    setLastStatusText(
      `Captured ${recorded.durationSec.toFixed(2)}s from microphone (${fs} Hz). Ready to run comparison.`
    );
  };

  const handleUploadNoisy = async (file: File) => {
    try {
      const decoded = await decodeAudioFile(file);
      setNoisyAudio(decoded);
      setIsLiveMicSource(false);
      setResults([]);
      setPlaybackTimeSec(null);
      syncSampleRateConfigs(decoded.sampleRate);

      if (scenario === 'A') {
        setCleanBaseAudio(decoded);
        setReferenceAudio(decoded);
      }
      setLastStatusText(
        `Loaded "${decoded.name}" (${decoded.sampleRate.toLocaleString('en-US')} Hz, ${decoded.durationSec.toFixed(2)}s).`
      );
    } catch (err) {
      setLastStatusText(err instanceof Error ? err.message : 'Failed to decode uploaded audio.');
    }
  };

  const handleUploadReference = async (file: File) => {
    try {
      const decoded = await decodeAudioFile(file);
      setReferenceAudio(decoded);
      setResults([]);
      setLastStatusText(`Loaded aligned reference "${decoded.name}".`);
    } catch (err) {
      setLastStatusText(err instanceof Error ? err.message : 'Failed to decode reference audio.');
    }
  };

  const handleSelectScenario = (next: DataScenario) => {
    setScenario(next);
    setResults([]);
    if (next === 'A') {
      const pair = buildScenarioAPair(syntheticNoiseKind, syntheticSnrDb, cleanBaseAudio);
      setNoisyAudio(pair.noisy);
      setReferenceAudio(pair.cleanReference);
      setIsLiveMicSource(false);
      syncSampleRateConfigs(pair.noisy.sampleRate);
      setLastStatusText(
        `Scenario A selected (${syntheticNoiseKind === 'white' ? 'White noise' : '50 Hz hum'}, ${syntheticSnrDb} dB).`
      );
    } else if (next === 'B') {
      setReferenceAudio(null);
      setLastStatusText(
        `Scenario B selected (No clean reference; initial ${noiseSegmentSec.toFixed(1)}s noise-only segment).`
      );
    } else {
      setLastStatusText('Scenario C selected (Upload aligned reference recording).');
    }
  };

  const handleApplyScenarioA = () => {
    const pair = buildScenarioAPair(syntheticNoiseKind, syntheticSnrDb, cleanBaseAudio);
    setNoisyAudio(pair.noisy);
    setReferenceAudio(pair.cleanReference);
    setIsLiveMicSource(false);
    setResults([]);
    syncSampleRateConfigs(pair.noisy.sampleRate);

    if (syntheticNoiseKind === 'hum50') {
      setIirConfig((prev) => ({ ...prev, type: 'bandstop', cutoffHz: 45, cutoffHighHz: 65 }));
      setFirConfig((prev) => ({ ...prev, type: 'highpass', cutoffHz: 100 }));
    } else {
      setFirConfig((prev) => ({ ...prev, type: 'lowpass', cutoffHz: 1200 }));
      setIirConfig((prev) => ({ ...prev, type: 'bandpass', cutoffHz: 120, cutoffHighHz: 1400 }));
    }
    setLastStatusText(
      `Generated Scenario A signal (${syntheticNoiseKind === 'white' ? 'White Noise' : '50 Hz Hum'} at ${syntheticSnrDb} dB SNR).`
    );
  };

  const handleLoadScenarioBSample = () => {
    const sampleB = buildScenarioBDemoSignal(noiseSegmentSec);
    setNoisyAudio(sampleB);
    setReferenceAudio(null);
    setIsLiveMicSource(false);
    setResults([]);
    syncSampleRateConfigs(sampleB.sampleRate);
    setLastStatusText(
      `Loaded Scenario B sample (${noiseSegmentSec.toFixed(1)}s initial noise-only segment).`
    );
  };

  const handleRunComparison = () => {
    if (!noisyAudio) return;
    setIsRunningComparison(true);
    setLastStatusText('Running block-level comparison across FIR, IIR, and Spectral Subtraction…');

    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          let effectiveReference = referenceAudio;
          if (scenario === 'C' && referenceAudio && alignmentOffsetSamples !== 0) {
            const src = referenceAudio.samples;
            const shifted = new Float32Array(src.length);
            for (let i = 0; i < src.length; i++) {
              const srcIdx = i - alignmentOffsetSamples;
              shifted[i] = srcIdx >= 0 && srcIdx < src.length ? src[srcIdx] : 0;
            }
            effectiveReference = { ...referenceAudio, samples: shifted };
          }

          const out = runThreeMethodComparison({
            noisyAudio,
            referenceAudio: effectiveReference,
            scenario,
            noiseSegmentSec,
            isLiveMicSource,
            blockSize,
            firConfig,
            iirConfig,
            spectralConfig,
          });
          setResults(out);

          // Log run in session history
          const validSnr = out.filter((r) => r.outputSnrDb !== null);
          const best =
            validSnr.length > 0
              ? validSnr.reduce((a, b) =>
                  (b.outputSnrDb ?? -Infinity) > (a.outputSnrDb ?? -Infinity) ? b : a
                )
              : null;

          const entry: SessionRunEntry = {
            id: `RUN-${String(sessionHistory.length + 1).padStart(3, '0')}`,
            timestamp: new Date().toISOString(),
            datasetName: noisyAudio.name,
            scenario,
            blockSize,
            sampleRate: noisyAudio.sampleRate,
            bestSnrMethod: best
              ? best.methodId === 'fir'
                ? 'FIR Filter'
                : best.methodId === 'iir'
                  ? 'IIR Butterworth'
                  : 'Spectral Subtraction'
              : 'Unreferenced',
            bestOutputSnrDb: best ? best.outputSnrDb : null,
            snrIsEstimate: best ? best.snrIsEstimate : false,
            summaryRows: out.map((r) => ({
              methodLabel: r.methodLabel,
              outputSnrDb: r.outputSnrDb,
              snrImprovementDb: r.snrImprovementDb,
              mse: r.mse,
              rmse: r.rmse,
              computePerBlockMs: r.computePerBlockMs,
              status: r.realtimeStatus,
            })),
          };
          setSessionHistory((prev) => [entry, ...prev]);

          setLastStatusText(
            `Completed comparison on ${noisyAudio.name} (${blockSize} samples/block).`
          );
        } catch (err) {
          setLastStatusText(
            err instanceof Error ? err.message : 'Error during 3-method comparison.'
          );
        } finally {
          setIsRunningComparison(false);
        }
      }, 18);
    });
  };

  const applyDefaultPreferences = () => {
    setBlockSize(preferences.defaultBlockSize);
    setFirConfig((prev) => ({
      ...prev,
      order: preferences.defaultFirOrder,
      sampleRate: noisyAudio?.sampleRate ?? preferences.defaultSampleRate,
    }));
    setIirConfig((prev) => ({
      ...prev,
      order: preferences.defaultIirOrder,
      sampleRate: noisyAudio?.sampleRate ?? preferences.defaultSampleRate,
    }));
    setSpectralConfig((prev) => ({
      ...prev,
      frameSize: preferences.defaultFrameSize,
      overlapRatio: preferences.defaultOverlapRatio,
    }));
  };

  const activeSampleRate = noisyAudio?.sampleRate ?? preferences.defaultSampleRate;
  const blockLatencyMs = (blockSize / activeSampleRate) * 1000;
  const bestResult =
    results.length > 0
      ? results.reduce((a, b) =>
          (b.outputSnrDb ?? -Infinity) > (a.outputSnrDb ?? -Infinity) ? b : a
        )
      : null;

  const meta = NAV_META[activeNav];

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      {/* LEFT SIDEBAR */}
      <NavigationSidebar
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        isRecording={isRecording}
        isRunningComparison={isRunningComparison}
        isLiveMicSource={isLiveMicSource}
        hasAudio={Boolean(noisyAudio)}
        blockSize={blockSize}
      />

      {/* RIGHT WORKSPACE COLUMN */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* COMPACT TOP HEADER */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--panel)] px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-[2px] border border-[var(--border)] p-1.5 text-[var(--text-primary)] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" strokeWidth={1.6} />
            </button>

            <div className="flex min-w-0 items-baseline gap-2.5">
              <h1 className="truncate text-[16px] font-semibold text-[var(--text-primary)]">
                {meta.title}
              </h1>
              <span className="hidden font-mono text-[11px] text-[var(--text-secondary)] sm:inline">
                {meta.group} / {meta.title}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 text-[11.5px]">
            <div className="hidden items-center gap-1.5 rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 font-mono md:flex">
              <span className="text-[var(--text-secondary)]">Dataset:</span>
              <span className="max-w-[180px] truncate text-[var(--text-primary)]">
                {noisyAudio ? noisyAudio.name : 'None'}
              </span>
            </div>

            <div className="hidden items-center gap-1.5 font-mono text-[11px] sm:flex">
              <span className="text-[var(--text-secondary)]">Status:</span>
              <span
                className={
                  isRecording
                    ? 'font-medium text-[var(--error)]'
                    : isRunningComparison
                      ? 'font-medium text-[var(--accent)]'
                      : 'font-medium text-[var(--success)]'
                }
              >
                {isRecording ? 'Recording' : isRunningComparison ? 'Running' : 'Idle'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveNav('general-settings')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-[var(--border)] bg-[var(--bg)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              aria-label="Open Settings"
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={1.6} />
            </button>
          </div>
        </header>

        {/* MAIN WORKSPACE VIEWPORT */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-4 p-4 sm:p-5">
          {/* OVERVIEW WORKSPACE */}
          {activeNav === 'overview' && (
            <>
              {/* Page Title & Guided Workflow Strip */}
              <div className="flex flex-col gap-3 rounded-[4px] border border-[var(--border)] bg-[var(--panel)] p-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-[24px] font-semibold leading-tight text-[var(--text-primary)]">
                    DSP Noise Reduction Workbench
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">
                    Comparative laboratory evaluation of FIR Filter, IIR Butterworth, and Spectral Subtraction.
                  </p>
                </div>

                {/* Guided Workflow Sequence */}
                <div className="flex flex-wrap items-center gap-1 font-mono text-[10.5px]">
                  {(
                    [
                      { label: 'INPUT', target: 'audio-input' },
                      { label: 'CONFIGURE', target: 'method-comparison' },
                      { label: 'PROCESS', target: 'method-comparison' },
                      { label: 'ANALYZE', target: 'signal-analysis' },
                      { label: 'COMPARE', target: 'evaluation-metrics' },
                      { label: 'EXPORT', target: 'audio-playback' },
                    ] as const
                  ).map((step, idx) => (
                    <React.Fragment key={step.label}>
                      <button
                        type="button"
                        onClick={() => setActiveNav(step.target)}
                        className="rounded-[2px] border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-[var(--text-primary)] hover:border-[var(--accent)]"
                      >
                        {step.label}
                      </button>
                      {idx < 5 && (
                        <span className="text-[var(--text-secondary)]" aria-hidden="true">
                          →
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Large Numerical Indicators Row */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                  <div className="text-[11px] text-[var(--text-secondary)]">Sampling Rate</div>
                  <div className="mt-1 font-mono text-[22px] font-medium tabular-nums text-[var(--text-primary)]">
                    {noisyAudio ? `${noisyAudio.sampleRate.toLocaleString('en-US')} Hz` : '—'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    Scenario {scenario} · {isLiveMicSource ? 'Live Mic' : 'PCM Buffer'}
                  </div>
                </div>

                <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                  <div className="text-[11px] text-[var(--text-secondary)]">Signal Duration</div>
                  <div className="mt-1 font-mono text-[22px] font-medium tabular-nums text-[var(--text-primary)]">
                    {noisyAudio ? `${noisyAudio.durationSec.toFixed(2)} s` : '—'}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {noisyAudio ? `${noisyAudio.samples.length.toLocaleString('en-US')} samples` : 'No data'}
                  </div>
                </div>

                <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                  <div className="text-[11px] text-[var(--text-secondary)]">Block Latency</div>
                  <div className="mt-1 font-mono text-[22px] font-medium tabular-nums text-[var(--text-primary)]">
                    {blockLatencyMs.toFixed(2)} ms
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {blockSize} samples / block
                  </div>
                </div>

                <div className="rounded-[4px] border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    Best Output SNR {scenario === 'B' ? '(Estimated)' : ''}
                  </div>
                  <div className="mt-1 font-mono text-[22px] font-medium tabular-nums text-[var(--signal-denoised)]">
                    {bestResult && bestResult.outputSnrDb !== null
                      ? `${bestResult.outputSnrDb.toFixed(preferences.numericalPrecision)} dB`
                      : 'Pending'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                    {bestResult
                      ? bestResult.methodId === 'fir'
                        ? 'FIR Filter'
                        : bestResult.methodId === 'iir'
                          ? 'IIR Butterworth'
                          : 'Spectral Subtraction'
                      : 'Run comparison to compute'}
                  </div>
                </div>
              </div>

              {/* 1. Signal Monitor + 2. Frequency Analysis */}
              <SignalMonitorSection
                noisyAudio={noisyAudio}
                referenceAudio={referenceAudio}
                results={results}
                isRecording={isRecording}
                liveTimeDomain={liveTimeDomain}
                liveFftDb={liveFftDb}
                playbackTimeSec={playbackTimeSec}
                preferences={preferences}
              />

              {/* Method Configuration & RUN COMPARISON */}
              <MethodConfigPanel
                activeAudio={noisyAudio}
                activeMethodTab={activeMethodTab}
                firConfig={firConfig}
                iirConfig={iirConfig}
                spectralConfig={spectralConfig}
                blockSize={blockSize}
                isRecording={isRecording}
                isRunningComparison={isRunningComparison}
                lastStatusText={lastStatusText}
                onChangeMethodTab={setActiveMethodTab}
                onUpdateFir={(patch) => setFirConfig((prev) => ({ ...prev, ...patch }))}
                onUpdateIir={(patch) => setIirConfig((prev) => ({ ...prev, ...patch }))}
                onUpdateSpectral={(patch) => setSpectralConfig((prev) => ({ ...prev, ...patch }))}
                onChangeBlockSize={setBlockSize}
                onRunComparison={handleRunComparison}
              />

              {/* 4. Quantitative Evaluation + Audio Output + Export */}
              <EvaluationAndOutputSection
                noisyAudio={noisyAudio}
                referenceAudio={referenceAudio}
                results={results}
                scenario={scenario}
                blockSize={blockSize}
                firConfig={firConfig}
                iirConfig={iirConfig}
                preferences={preferences}
                onPlaybackProgress={setPlaybackTimeSec}
              />
            </>
          )}

          {/* AUDIO INPUT */}
          {activeNav === 'audio-input' && (
            <AudioInputSection
              activeAudio={noisyAudio}
              referenceAudio={referenceAudio}
              isRecording={isRecording}
              recordingDurationSec={recordingDurationSec}
              micLevelDb={micLevelDb}
              micLevelPct={micLevelPct}
              micPermission={micPermission}
              scenario={scenario}
              syntheticNoiseKind={syntheticNoiseKind}
              syntheticSnrDb={syntheticSnrDb}
              noiseSegmentSec={noiseSegmentSec}
              alignmentOffsetSamples={alignmentOffsetSamples}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              onUploadNoisy={handleUploadNoisy}
              onUploadReference={handleUploadReference}
              onSelectScenario={handleSelectScenario}
              onChangeSyntheticNoise={setSyntheticNoiseKind}
              onChangeSyntheticSnr={setSyntheticSnrDb}
              onApplyScenarioA={handleApplyScenarioA}
              onChangeNoiseSegmentSec={setNoiseSegmentSec}
              onLoadScenarioBSample={handleLoadScenarioBSample}
              onChangeAlignmentOffset={setAlignmentOffsetSamples}
            />
          )}

          {/* SIGNAL ANALYSIS */}
          {activeNav === 'signal-analysis' && (
            <SignalMonitorSection
              noisyAudio={noisyAudio}
              referenceAudio={referenceAudio}
              results={results}
              isRecording={isRecording}
              liveTimeDomain={liveTimeDomain}
              liveFftDb={liveFftDb}
              playbackTimeSec={playbackTimeSec}
              preferences={preferences}
              showFrequencyPanels
            />
          )}

          {/* METHOD COMPARISON */}
          {activeNav === 'method-comparison' && (
            <>
              <MethodConfigPanel
                activeAudio={noisyAudio}
                activeMethodTab={activeMethodTab}
                firConfig={firConfig}
                iirConfig={iirConfig}
                spectralConfig={spectralConfig}
                blockSize={blockSize}
                isRecording={isRecording}
                isRunningComparison={isRunningComparison}
                lastStatusText={lastStatusText}
                onChangeMethodTab={setActiveMethodTab}
                onUpdateFir={(patch) => setFirConfig((prev) => ({ ...prev, ...patch }))}
                onUpdateIir={(patch) => setIirConfig((prev) => ({ ...prev, ...patch }))}
                onUpdateSpectral={(patch) => setSpectralConfig((prev) => ({ ...prev, ...patch }))}
                onChangeBlockSize={setBlockSize}
                onRunComparison={handleRunComparison}
              />

              <SignalMonitorSection
                noisyAudio={noisyAudio}
                referenceAudio={referenceAudio}
                results={results}
                isRecording={isRecording}
                liveTimeDomain={liveTimeDomain}
                liveFftDb={liveFftDb}
                playbackTimeSec={playbackTimeSec}
                preferences={preferences}
                showFrequencyPanels={false}
              />

              <EvaluationAndOutputSection
                noisyAudio={noisyAudio}
                referenceAudio={referenceAudio}
                results={results}
                scenario={scenario}
                blockSize={blockSize}
                firConfig={firConfig}
                iirConfig={iirConfig}
                preferences={preferences}
                onPlaybackProgress={setPlaybackTimeSec}
                showPlayers={false}
                showExports={false}
              />
            </>
          )}

          {/* FILTER LABORATORY */}
          {activeNav === 'filter-lab' && (
            <FilterLabSection
              firConfig={firConfig}
              iirConfig={iirConfig}
              sampleRate={activeSampleRate}
              preferences={preferences}
            />
          )}

          {/* EVALUATION METRICS */}
          {activeNav === 'evaluation-metrics' && (
            <EvaluationAndOutputSection
              noisyAudio={noisyAudio}
              referenceAudio={referenceAudio}
              results={results}
              scenario={scenario}
              blockSize={blockSize}
              firConfig={firConfig}
              iirConfig={iirConfig}
              preferences={preferences}
              onPlaybackProgress={setPlaybackTimeSec}
              showPlayers={false}
            />
          )}

          {/* AUDIO PLAYBACK */}
          {activeNav === 'audio-playback' && (
            <>
              <EvaluationAndOutputSection
                noisyAudio={noisyAudio}
                referenceAudio={referenceAudio}
                results={results}
                scenario={scenario}
                blockSize={blockSize}
                firConfig={firConfig}
                iirConfig={iirConfig}
                preferences={preferences}
                onPlaybackProgress={setPlaybackTimeSec}
                showTable={false}
              />
              <SignalMonitorSection
                noisyAudio={noisyAudio}
                referenceAudio={referenceAudio}
                results={results}
                isRecording={isRecording}
                liveTimeDomain={liveTimeDomain}
                liveFftDb={liveFftDb}
                playbackTimeSec={playbackTimeSec}
                preferences={preferences}
                showFrequencyPanels={false}
              />
            </>
          )}

          {/* EEG SIGNAL ANALYSIS (OFFLINE) */}
          {activeNav === 'eeg-analysis' && (
            <EegAnalysisSection
              dataset={eegDataset}
              eegOutput={eegOutput}
              eegHistoryRows={eegHistoryRows}
              preferences={preferences}
              onLoadDataset={(ds) => {
                setEegDataset(ds);
                setEegOutput(null);
                setEegHistoryRows([]);
                setLastStatusText(
                  `Loaded offline EEG dataset "${ds.name}" (${ds.channelNames.length} ch, ${ds.samplingRateHz} Hz).`
                );
              }}
              onProcessedOutput={(out, rows) => {
                setEegOutput(out);
                setEegHistoryRows((prev) => [...rows, ...prev]);
                setLastStatusText(
                  `Completed offline EEG filtering on ${rows.length} channel(s).`
                );
              }}
            />
          )}

          {/* CROSS-DOMAIN COMPARISON */}
          {activeNav === 'cross-domain' && (
            <CrossDomainSection
              audioDataset={noisyAudio}
              audioScenario={scenario}
              audioResults={results}
              audioBlockSize={blockSize}
              eegDataset={eegDataset}
              eegRows={eegHistoryRows}
            />
          )}

          {/* EXPERIMENT HISTORY */}
          {activeNav === 'experiment-history' && (
            <ExperimentHistorySection
              runs={sessionHistory}
              onClearHistory={() => setSessionHistory([])}
            />
          )}

          {/* GENERAL & PROCESSING SETTINGS */}
          {(activeNav === 'general-settings' || activeNav === 'processing-settings') && (
            <SettingsSection
              mode={activeNav === 'general-settings' ? 'general' : 'processing'}
              preferences={preferences}
              onUpdatePreferences={(patch) =>
                setPreferences((prev) => ({ ...prev, ...patch }))
              }
              onApplyDefaultsToWorkspace={applyDefaultPreferences}
            />
          )}
        </main>
      </div>
    </div>
  );
}
