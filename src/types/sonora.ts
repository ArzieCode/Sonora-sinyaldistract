export type NavSectionId =
  | 'overview'
  | 'audio-input'
  | 'signal-analysis'
  | 'method-comparison'
  | 'filter-lab'
  | 'evaluation-metrics'
  | 'audio-playback'
  | 'experiment-history'
  | 'eeg-analysis'
  | 'cross-domain'
  | 'general-settings'
  | 'processing-settings';

export type FilterArchitecture = 'FIR' | 'IIR';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'bandstop';
export type WindowType = 'hamming' | 'hann' | 'blackman';

export interface FilterConfig {
  architecture: FilterArchitecture;
  type: FilterType;
  cutoffHz: number;
  cutoffHighHz: number;
  order: number;
  sampleRate: number;
  windowType: WindowType;
  zeroPhase: boolean;
}

export interface ComplexNumber {
  re: number;
  im: number;
}

export interface FilterDesignResult {
  config: FilterConfig;
  b: number[];
  a: number[];
  zeros: ComplexNumber[];
  poles: ComplexNumber[];
  isStable: boolean;
  maxPoleMagnitude: number;
  frequencies: number[];
  magnitudeDb: number[];
  phaseDeg: number[];
  impulseResponse: number[];
  impulseTimeSamples: number[];
  differenceEquation: string;
}

export interface AudioSignalData {
  id: string;
  name: string;
  format: string;
  fileSizeBytes: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  samples: Float32Array;
  channelBuffers: Float32Array[];
  blobUrl: string;
  isDemoData: boolean;
  loadedAt: string;
}

export interface SignalMetrics {
  durationSec: number;
  sampleRate: number;
  channels: number;
  sampleCount: number;
  maxAmplitude: number;
  minAmplitude: number;
  rmsAmplitude: number;
  peakToPeak: number;
  crestFactor: number;
}

export interface ReferenceComparisonMetrics {
  hasReference: boolean;
  inputSnrDb: number | null;
  outputSnrDb: number | null;
  snrImprovementDb: number | null;
  mse: number | null;
  rmse: number | null;
  alignedSamples: number;
}

export interface ProcessingRunRecord {
  id: string;
  timestamp: string;
  audioFilename: string;
  referenceFilename: string | null;
  filterArchitecture: FilterArchitecture;
  filterType: FilterType;
  cutoffLabel: string;
  order: number;
  sampleRate: number;
  processingDurationMs: number;
  snrDb: number | null;
  snrImprovementDb: number | null;
  mse: number | null;
  rmse: number | null;
  status: 'Completed' | 'Failed';
  isDemoData: boolean;
  config: FilterConfig;
}

export interface SessionRunEntry {
  id: string;
  timestamp: string;
  datasetName: string;
  scenario: 'A' | 'B' | 'C';
  blockSize: number;
  sampleRate: number;
  bestSnrMethod: string;
  bestOutputSnrDb: number | null;
  snrIsEstimate: boolean;
  summaryRows: Array<{
    methodLabel: string;
    outputSnrDb: number | null;
    snrImprovementDb: number | null;
    mse: number | null;
    rmse: number | null;
    computePerBlockMs: number;
    status: string;
  }>;
}

export interface LabPreferences {
  defaultSampleRate: number;
  defaultBlockSize: number;
  defaultFirOrder: number;
  defaultIirOrder: number;
  defaultFrameSize: 256 | 512 | 1024 | 2048;
  defaultOverlapRatio: 0.5 | 0.75;
  waveformDisplayMode: 'overlay' | 'individual';
  fftScale: 'linear' | 'log';
  spectrogramRangeMin: number;
  spectrogramRangeMax: number;
  showGrid: boolean;
  numericalPrecision: 2 | 3 | 4;
  channelHandling: 'mono-mix' | 'left-only';
}

// Legacy EEG & App types preserved for existing helper files compatibility
export type BrainwaveBandName = 'Delta' | 'Theta' | 'Alpha' | 'Beta' | 'Gamma';
export interface BandPowerSummary {
  band: BrainwaveBandName;
  rangeHz: string;
  minHz: number;
  maxHz: number;
  absolutePower: number;
  relativePowerPct: number;
}
export interface EegArtifactReport {
  lineNoiseRatioPct: number;
  highAmpArtifactEpochsPct: number;
  flatlineChannels: string[];
  usableDataPct: number;
  qualityNote: string;
}
export interface EegConditionData {
  conditionLabel: string;
  samplingRateHz: number;
  durationSec: number;
  channels: Record<string, number[]>;
  timeSec: number[];
  artifactReport: EegArtifactReport;
}
export interface EegSession {
  id: string;
  title: string;
  subtitle: string;
  createdAt: string;
  isSimulated: boolean;
  sourceLabel: string;
  participantCode: string;
  audioContextNote: string;
  conditionA: EegConditionData;
  conditionB: EegConditionData;
}
export interface ExperimentRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  audioFilename: string;
  referenceFilename: string | null;
  filterConfig: FilterConfig;
  processingDurationMs: number | null;
  snrDb: number | null;
  mse: number | null;
  rmse: number | null;
  eegSessionId: string | null;
  eegSessionTitle: string | null;
  status: 'Completed' | 'Draft';
  isDemoData: boolean;
}
export interface AppSettings {
  defaultFftSize: 256 | 512 | 1024 | 2048;
  defaultWindowType: WindowType;
  defaultSampleRate: number;
  defaultZeroPhase: boolean;
}
export interface AppNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
