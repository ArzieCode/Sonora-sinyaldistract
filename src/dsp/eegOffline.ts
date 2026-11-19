import { computeWelchPsd, PsdResult } from './fft';
import { filterAudioChannel } from './filters';
import { computeReferenceMetrics } from './metrics';
import { FilterConfig } from '../types/sonora';

export type EegPreprocessingStatus = 'Raw' | 'Noisy' | 'Preprocessed';

export interface EegDataset {
  id: string;
  name: string;
  source: string;
  format: 'EDF' | 'CSV' | 'JSON' | 'CALIBRATION';
  samplingRateHz: number;
  channelNames: string[];
  channels: Record<string, Float32Array>;
  durationSec: number;
  totalSamples: number;
  preprocessingStatus: EegPreprocessingStatus;
  isSyntheticCalibration: boolean;
  metadata: Record<string, string>;
}

export interface EegBandMetric {
  band: 'Delta' | 'Theta' | 'Alpha' | 'Beta' | 'Gamma';
  rangeHz: string;
  minHz: number;
  maxHz: number;
  supported: boolean;
  powerBefore: number | null;
  powerAfter: number | null;
  relativeBeforePct: number | null;
  relativeAfterPct: number | null;
  deltaPct: number | null;
}

export interface EegEvaluationRow {
  id: string;
  methodLabel: string;
  architecture: 'FIR' | 'IIR';
  channel: string;
  samplingRateHz: number;
  filterSummary: string;
  powerBeforeUv2: number;
  powerAfterUv2: number;
  powerChangePct: number;
  alphaChangePct: number | null;
  line50HzChangePct: number | null;
  processingTimeMs: number;
  mse: number | null;
  rmse: number | null;
  snrDb: number | null;
  config: FilterConfig;
}

export interface EegChannelComparison {
  channel: string;
  timeSec: number[];
  raw: Float32Array;
  filtered: Float32Array;
  psdBefore: PsdResult;
  psdAfter: PsdResult;
  bands: EegBandMetric[];
}

export interface EegProcessingOutput {
  datasetId: string;
  channelResults: Record<string, EegChannelComparison>;
  evaluationRows: EegEvaluationRow[];
}

export const EEG_BAND_DEFS: Array<{
  band: EegBandMetric['band'];
  minHz: number;
  maxHz: number;
  rangeHz: string;
}> = [
  { band: 'Delta', minHz: 0.5, maxHz: 4, rangeHz: '0.5–4 Hz' },
  { band: 'Theta', minHz: 4, maxHz: 8, rangeHz: '4–8 Hz' },
  { band: 'Alpha', minHz: 8, maxHz: 13, rangeHz: '8–13 Hz' },
  { band: 'Beta', minHz: 13, maxHz: 30, rangeHz: '13–30 Hz' },
  { band: 'Gamma', minHz: 30, maxHz: 45, rangeHz: '30–45 Hz' },
];

function readAscii(bytes: Uint8Array, start: number, len: number): string {
  let out = '';
  for (let i = 0; i < len && start + i < bytes.length; i++) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out.trim();
}

/**
 * Parses standard 16-bit binary European Data Format (.edf) EEG recordings into µV Float32Arrays.
 */
export function parseEdfBuffer(buffer: ArrayBuffer, filename: string): EegDataset {
  if (buffer.byteLength < 256) {
    throw new Error('EDF file is smaller than the mandatory 256-byte header.');
  }

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const version = readAscii(bytes, 0, 8);
  if (!version.startsWith('0')) {
    throw new Error(`Invalid EDF version header ("${version}"). Expected standard EDF/EDF+.`);
  }

  const patientId = readAscii(bytes, 8, 80);
  const recordingId = readAscii(bytes, 88, 80);
  const startDate = readAscii(bytes, 168, 8);
  const startTime = readAscii(bytes, 176, 8);
  const headerBytes = parseInt(readAscii(bytes, 184, 8), 10);
  const numRecords = parseInt(readAscii(bytes, 236, 8), 10);
  const recordDurationSec = parseFloat(readAscii(bytes, 244, 8));
  const numSignals = parseInt(readAscii(bytes, 252, 4), 10);

  if (!Number.isFinite(numSignals) || numSignals <= 0 || !Number.isFinite(headerBytes)) {
    throw new Error('Corrupted EDF signal count or header size.');
  }
  if (buffer.byteLength < headerBytes) {
    throw new Error('EDF file truncated inside signal header table.');
  }

  const readSignalField = (offsetBase: number, fieldLen: number) => {
    const arr: string[] = [];
    for (let s = 0; s < numSignals; s++) {
      arr.push(readAscii(bytes, offsetBase + s * fieldLen, fieldLen));
    }
    return arr;
  };

  let ptr = 256;
  const labels = readSignalField(ptr, 16);
  ptr += numSignals * 16;
  ptr += numSignals * 80; // transducer
  const physDims = readSignalField(ptr, 8);
  ptr += numSignals * 8;
  const physMins = readSignalField(ptr, 8).map(Number);
  ptr += numSignals * 8;
  const physMaxs = readSignalField(ptr, 8).map(Number);
  ptr += numSignals * 8;
  const digMins = readSignalField(ptr, 8).map((v) => parseInt(v, 10));
  ptr += numSignals * 8;
  const digMaxs = readSignalField(ptr, 8).map((v) => parseInt(v, 10));
  ptr += numSignals * 8;
  const prefiltering = readSignalField(ptr, 80);
  ptr += numSignals * 80;
  const samplesPerRecord = readSignalField(ptr, 8).map((v) => parseInt(v, 10));

  // Filter out EDF+ Annotation channels from EEG signal list
  const eegSignalIndices: number[] = [];
  for (let s = 0; s < numSignals; s++) {
    if (!labels[s].toLowerCase().includes('edf annotations') && samplesPerRecord[s] > 0) {
      eegSignalIndices.push(s);
    }
  }
  if (eegSignalIndices.length === 0) {
    throw new Error('No EEG signal channels found in EDF file.');
  }

  const primarySamplesPerRec = samplesPerRecord[eegSignalIndices[0]];
  const recDur = Number.isFinite(recordDurationSec) && recordDurationSec > 0 ? recordDurationSec : 1;
  const samplingRateHz = Math.round(primarySamplesPerRec / recDur);

  const bytesPerRecord = samplesPerRecord.reduce((acc, n) => acc + n * 2, 0);
  const availableRecords =
    numRecords > 0
      ? Math.min(numRecords, Math.floor((buffer.byteLength - headerBytes) / bytesPerRecord))
      : Math.floor((buffer.byteLength - headerBytes) / bytesPerRecord);

  if (availableRecords <= 0) {
    throw new Error('EDF file contains zero complete data records.');
  }

  // Keep channels matching primary sample rate (or resample-free standard EEG channels)
  const validIndices = eegSignalIndices.filter(
    (s) => samplesPerRecord[s] === primarySamplesPerRec
  );

  const totalSamples = availableRecords * primarySamplesPerRec;
  const channelNames: string[] = [];
  const channels: Record<string, Float32Array> = {};

  validIndices.forEach((s) => {
    const cleanName = labels[s].replace(/^EEG\s+/i, '').trim() || `CH${s + 1}`;
    channelNames.push(cleanName);
    channels[cleanName] = new Float32Array(totalSamples);
  });

  // Compute signal offsets within each EDF data record
  const recordOffsets: number[] = [];
  let accBytes = 0;
  for (let s = 0; s < numSignals; s++) {
    recordOffsets.push(accBytes);
    accBytes += samplesPerRecord[s] * 2;
  }

  for (let r = 0; r < availableRecords; r++) {
    const recStart = headerBytes + r * bytesPerRecord;
    validIndices.forEach((s, idx) => {
      const chName = channelNames[idx];
      const target = channels[chName];
      const digMin = Number.isFinite(digMins[s]) ? digMins[s] : -32768;
      const digMax = Number.isFinite(digMaxs[s]) ? digMaxs[s] : 32767;
      const physMin = Number.isFinite(physMins[s]) ? physMins[s] : -500;
      const physMax = Number.isFinite(physMaxs[s]) ? physMaxs[s] : 500;
      const scale = digMax !== digMin ? (physMax - physMin) / (digMax - digMin) : 1;
      const unitScale = physDims[s].toLowerCase() === 'mv' ? 1000 : 1;

      const sigByteOffset = recStart + recordOffsets[s];
      const baseSample = r * primarySamplesPerRec;
      for (let k = 0; k < primarySamplesPerRec; k++) {
        const rawInt16 = view.getInt16(sigByteOffset + k * 2, true);
        target[baseSample + k] = ((rawInt16 - digMin) * scale + physMin) * unitScale;
      }
    });
  }

  const hasPrefilter = prefiltering.some((p) => p.length > 0 && !p.toLowerCase().includes('none'));

  return {
    id: `eeg-edf-${Date.now()}`,
    name: filename,
    source: 'Imported EDF Dataset',
    format: 'EDF',
    samplingRateHz,
    channelNames,
    channels,
    durationSec: totalSamples / samplingRateHz,
    totalSamples,
    preprocessingStatus: hasPrefilter ? 'Preprocessed' : 'Raw',
    isSyntheticCalibration: false,
    metadata: {
      Patient: patientId || 'Unspecified',
      Recording: recordingId || 'Unspecified',
      Date: `${startDate} ${startTime}`.trim(),
      PhysicalUnit: physDims[validIndices[0]] || 'µV',
      Prefiltering: prefiltering[validIndices[0]] || 'None recorded',
    },
  };
}

export function parseCsvOrJsonEeg(
  filename: string,
  text: string,
  fallbackFs: number
): EegDataset {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(text);
    const fs = Number(parsed.samplingRateHz || parsed.fs || fallbackFs || 256);
    if (!parsed.channels || typeof parsed.channels !== 'object') {
      throw new Error('EEG JSON must contain a "channels" object mapping channel names to sample arrays.');
    }
    const channelNames: string[] = [];
    const channels: Record<string, Float32Array> = {};
    let totalSamples = 0;
    for (const [k, val] of Object.entries(parsed.channels)) {
      if (!Array.isArray(val) || val.length < 32) continue;
      const arr = new Float32Array(val.map(Number));
      channelNames.push(k);
      channels[k] = arr;
      totalSamples = Math.max(totalSamples, arr.length);
    }
    if (channelNames.length === 0) {
      throw new Error('No valid numeric channels (>= 32 samples) found in JSON file.');
    }
    return {
      id: `eeg-json-${Date.now()}`,
      name: filename,
      source: parsed.source ? String(parsed.source) : 'Imported JSON EEG Dataset',
      format: 'JSON',
      samplingRateHz: fs,
      channelNames,
      channels,
      durationSec: totalSamples / fs,
      totalSamples,
      preprocessingStatus:
        parsed.preprocessingStatus === 'Preprocessed' || parsed.preprocessingStatus === 'Noisy'
          ? parsed.preprocessingStatus
          : 'Raw',
      isSyntheticCalibration: false,
      metadata: {
        Format: 'JSON',
        Unit: 'µV',
      },
    };
  }

  // CSV
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 34) {
    throw new Error('EEG CSV must contain a header row and at least 32 sample rows.');
  }
  const headers = lines[0].split(',').map((h) => h.trim());
  const firstLower = headers[0].toLowerCase();
  const hasTimeCol = firstLower === 'time' || firstLower === 't' || firstLower === 'timestamp';
  const startCol = hasTimeCol ? 1 : 0;
  const channelNames = headers.slice(startCol).filter(Boolean);
  if (channelNames.length === 0) {
    throw new Error('EEG CSV header must contain at least one channel column.');
  }

  const lists: number[][] = channelNames.map(() => []);
  const times: number[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = lines[r].split(',');
    if (cols.length < startCol + channelNames.length) continue;
    if (hasTimeCol) {
      const tv = Number(cols[0]);
      if (Number.isFinite(tv)) times.push(tv);
    }
    for (let c = 0; c < channelNames.length; c++) {
      const v = Number(cols[startCol + c]);
      lists[c].push(Number.isFinite(v) ? v : 0);
    }
  }

  const totalSamples = lists[0].length;
  if (totalSamples < 32) {
    throw new Error('Parsed fewer than 32 valid EEG sample rows.');
  }

  let fs = fallbackFs;
  if (times.length >= 2) {
    const dt = times[1] - times[0];
    if (dt > 0.0002 && dt < 0.1) fs = Math.round(1 / dt);
  }

  const channels: Record<string, Float32Array> = {};
  channelNames.forEach((name, idx) => {
    channels[name] = new Float32Array(lists[idx]);
  });

  return {
    id: `eeg-csv-${Date.now()}`,
    name: filename,
    source: 'Imported CSV EEG Dataset',
    format: 'CSV',
    samplingRateHz: fs,
    channelNames,
    channels,
    durationSec: totalSamples / fs,
    totalSamples,
    preprocessingStatus: 'Raw',
    isSyntheticCalibration: false,
    metadata: {
      Format: 'CSV',
      Unit: 'µV',
      TimeColumn: hasTimeCol ? headers[0] : 'Sample index',
    },
  };
}

/**
 * Generates a deterministic calibration test signal (NOT a real human EEG recording)
 * strictly for verifying offline FIR/IIR notch and bandpass filters when no EDF/CSV file is loaded.
 */
export function buildSyntheticEegCalibrationDataset(): EegDataset {
  const fs = 256;
  const durationSec = 8;
  const n = fs * durationSec;
  const channelNames = ['Fp1', 'Fp2', 'C3', 'C4', 'O1', 'O2'];
  const channels: Record<string, Float32Array> = {};

  channelNames.forEach((name, idx) => {
    const arr = new Float32Array(n);
    const phase = idx * 0.65;
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      // Slow baseline drift (0.25 Hz) + 2 Hz + 6 Hz + 10.5 Hz + 21 Hz + 50 Hz mains interference
      const drift = 18 * Math.sin(2 * Math.PI * 0.25 * t + phase);
      const delta = 12 * Math.sin(2 * Math.PI * 2.0 * t + phase);
      const theta = 9 * Math.sin(2 * Math.PI * 6.0 * t + phase);
      const alpha = (name.startsWith('O') ? 22 : 12) * Math.sin(2 * Math.PI * 10.5 * t + phase);
      const beta = 7 * Math.sin(2 * Math.PI * 21.0 * t + phase);
      const line50 = 16 * Math.sin(2 * Math.PI * 50.0 * t);
      arr[i] = drift + delta + theta + alpha + beta + line50;
    }
    channels[name] = arr;
  });

  return {
    id: 'eeg-calibration-test',
    name: 'calibration_test_6ch_256hz.csv',
    source: 'Synthetic Calibration Signal (Non-Physiological Filter Test Vector)',
    format: 'CALIBRATION',
    samplingRateHz: fs,
    channelNames,
    channels,
    durationSec,
    totalSamples: n,
    preprocessingStatus: 'Noisy',
    isSyntheticCalibration: true,
    metadata: {
      Purpose: 'Deterministic filter validation (0.25 Hz drift + 10.5 Hz + 50 Hz mains)',
      SubjectData: 'None — Not a real physiological recording',
      Unit: 'µV',
    },
  };
}

function integrateBandPower(psd: PsdResult, minHz: number, maxHz: number): number {
  let power = 0;
  for (let k = 0; k < psd.frequencies.length - 1; k++) {
    const f0 = psd.frequencies[k];
    const f1 = psd.frequencies[k + 1];
    const mid = 0.5 * (f0 + f1);
    if (mid >= minHz && mid < maxHz) {
      power += 0.5 * (psd.psd[k] + psd.psd[k + 1]) * (f1 - f0);
    }
  }
  return power;
}

function computeTotalSignalPower(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return sum / samples.length;
}

/**
 * Applies offline FIR or IIR filtering independently to selected EEG channels within the time window.
 */
export function runOfflineEegFiltering(
  dataset: EegDataset,
  selectedChannels: string[],
  startSec: number,
  endSec: number,
  filterConfig: FilterConfig,
  referenceChannelData?: Float32Array | null
): EegProcessingOutput {
  const fs = dataset.samplingRateHz;
  const startIdx = Math.max(0, Math.floor(startSec * fs));
  const endIdx = Math.min(dataset.totalSamples, Math.max(startIdx + 32, Math.floor(endSec * fs)));
  const len = endIdx - startIdx;
  const nyquist = fs / 2;

  const effectiveCfg: FilterConfig = {
    ...filterConfig,
    sampleRate: fs,
  };

  const timeSec = Array.from({ length: len }, (_, i) => Number(((startIdx + i) / fs).toFixed(4)));
  const channelResults: Record<string, EegChannelComparison> = {};
  const evaluationRows: EegEvaluationRow[] = [];

  for (const chName of selectedChannels) {
    const fullVec = dataset.channels[chName];
    if (!fullVec) continue;

    const rawSlice = fullVec.slice(startIdx, endIdx);

    const t0 = performance.now();
    const filteredSlice = filterAudioChannel(rawSlice, effectiveCfg);
    const processingTimeMs = performance.now() - t0;

    const fftSize = fs >= 256 ? 512 : 256;
    const psdBefore = computeWelchPsd(rawSlice, fs, fftSize);
    const psdAfter = computeWelchPsd(filteredSlice, fs, fftSize);

    // Band powers only when Nyquist supports the upper band limit
    const supportedRaw = EEG_BAND_DEFS.map((b) =>
      nyquist > b.maxHz ? integrateBandPower(psdBefore, b.minHz, b.maxHz) : null
    );
    const supportedFiltered = EEG_BAND_DEFS.map((b) =>
      nyquist > b.maxHz ? integrateBandPower(psdAfter, b.minHz, b.maxHz) : null
    );

    const totalSupportedBefore = supportedRaw.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    const totalSupportedAfter = supportedFiltered.reduce<number>((acc, v) => acc + (v ?? 0), 0);

    const bands: EegBandMetric[] = EEG_BAND_DEFS.map((b, idx) => {
      const pb = supportedRaw[idx];
      const pa = supportedFiltered[idx];
      const supported = pb !== null && pa !== null;
      const relBefore =
        supported && totalSupportedBefore > 1e-12 ? (pb / totalSupportedBefore) * 100 : null;
      const relAfter =
        supported && totalSupportedAfter > 1e-12 ? (pa / totalSupportedAfter) * 100 : null;
      const deltaPct =
        supported && pb > 1e-12 ? ((pa - pb) / pb) * 100 : supported ? 0 : null;

      return {
        band: b.band,
        rangeHz: b.rangeHz,
        minHz: b.minHz,
        maxHz: b.maxHz,
        supported,
        powerBefore: pb,
        powerAfter: pa,
        relativeBeforePct: relBefore,
        relativeAfterPct: relAfter,
        deltaPct,
      };
    });

    const powerBeforeUv2 = computeTotalSignalPower(rawSlice);
    const powerAfterUv2 = computeTotalSignalPower(filteredSlice);
    const powerChangePct =
      powerBeforeUv2 > 1e-12 ? ((powerAfterUv2 - powerBeforeUv2) / powerBeforeUv2) * 100 : 0;

    const alphaBand = bands.find((b) => b.band === 'Alpha');
    let line50HzChangePct: number | null = null;
    if (nyquist > 52) {
      const p50Before = integrateBandPower(psdBefore, 48, 52);
      const p50After = integrateBandPower(psdAfter, 48, 52);
      line50HzChangePct = p50Before > 1e-12 ? ((p50After - p50Before) / p50Before) * 100 : 0;
    }

    let mse: number | null = null;
    let rmse: number | null = null;
    let snrDb: number | null = null;
    if (referenceChannelData && referenceChannelData.length >= endIdx) {
      const refSlice = referenceChannelData.slice(startIdx, endIdx);
      const metrics = computeReferenceMetrics(rawSlice, filteredSlice, refSlice);
      mse = metrics.mse;
      rmse = metrics.rmse;
      snrDb = metrics.outputSnrDb;
    }

    const cutoffDesc =
      effectiveCfg.type === 'bandpass' || effectiveCfg.type === 'bandstop'
        ? `${effectiveCfg.cutoffHz}–${effectiveCfg.cutoffHighHz} Hz`
        : `${effectiveCfg.cutoffHz} Hz`;

    const typeLabel = effectiveCfg.type === 'bandstop' ? 'Notch' : effectiveCfg.type;

    channelResults[chName] = {
      channel: chName,
      timeSec,
      raw: rawSlice,
      filtered: filteredSlice,
      psdBefore,
      psdAfter,
      bands,
    };

    evaluationRows.push({
      id: `${effectiveCfg.architecture}-${chName}-${Date.now()}`,
      methodLabel:
        effectiveCfg.architecture === 'FIR' ? 'FIR Filter' : 'IIR Butterworth',
      architecture: effectiveCfg.architecture,
      channel: chName,
      samplingRateHz: fs,
      filterSummary: `${typeLabel} · Ord ${effectiveCfg.order} · ${cutoffDesc}`,
      powerBeforeUv2,
      powerAfterUv2,
      powerChangePct,
      alphaChangePct: alphaBand?.deltaPct ?? null,
      line50HzChangePct,
      processingTimeMs,
      mse,
      rmse,
      snrDb,
      config: effectiveCfg,
    });
  }

  return {
    datasetId: dataset.id,
    channelResults,
    evaluationRows,
  };
}
