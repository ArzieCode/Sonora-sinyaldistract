import {
  BandPowerSummary,
  BrainwaveBandName,
  EegArtifactReport,
  EegConditionData,
  EegSession,
} from '../types/sonora';
import { computeWelchPsd } from './fft';

export const EEG_BANDS: Array<{
  band: BrainwaveBandName;
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

export function computeEegArtifactReport(
  channels: Record<string, number[]>,
  samplingRateHz: number
): EegArtifactReport {
  const chNames = Object.keys(channels);
  if (chNames.length === 0) {
    return {
      lineNoiseRatioPct: 0,
      highAmpArtifactEpochsPct: 0,
      flatlineChannels: [],
      usableDataPct: 0,
      qualityNote: 'No EEG channel vectors available.',
    };
  }

  const flatlineChannels: string[] = [];
  let totalEpochs = 0;
  let artifactEpochs = 0;
  let lineNoiseSum = 0;

  const epochSamples = Math.max(1, Math.floor(samplingRateHz)); // 1-second epochs

  for (const name of chNames) {
    const vec = channels[name];
    if (!vec || vec.length === 0) {
      flatlineChannels.push(name);
      continue;
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < vec.length; i++) {
      if (vec[i] < min) min = vec[i];
      if (vec[i] > max) max = vec[i];
    }
    if (max - min < 1e-3) {
      flatlineChannels.push(name);
    }

    // Check 1-second epochs for > 95 uV peak-to-peak excursion (e.g., EOG blink / motion)
    for (let start = 0; start < vec.length; start += epochSamples) {
      const end = Math.min(vec.length, start + epochSamples);
      let eMin = Infinity;
      let eMax = -Infinity;
      for (let i = start; i < end; i++) {
        if (vec[i] < eMin) eMin = vec[i];
        if (vec[i] > eMax) eMax = vec[i];
      }
      totalEpochs++;
      if (eMax - eMin > 110) {
        artifactEpochs++;
      }
    }

    // Check 50-60 Hz line noise ratio vs total 1-65 Hz power
    const psd = computeWelchPsd(vec, samplingRateHz, 512);
    let totalPow = 0;
    let linePow = 0;
    for (let k = 0; k < psd.frequencies.length - 1; k++) {
      const f = psd.frequencies[k];
      const df = psd.frequencies[k + 1] - f;
      const p = 0.5 * (psd.psd[k] + psd.psd[k + 1]) * df;
      if (f >= 1 && f <= 65) totalPow += p;
      if ((f >= 48 && f <= 52) || (f >= 58 && f <= 62)) linePow += p;
    }
    lineNoiseSum += totalPow > 1e-12 ? (linePow / totalPow) * 100 : 0;
  }

  const highAmpArtifactEpochsPct =
    totalEpochs > 0 ? (artifactEpochs / totalEpochs) * 100 : 0;
  const lineNoiseRatioPct = lineNoiseSum / chNames.length;
  const usableDataPct = Math.max(0, 100 - highAmpArtifactEpochsPct);

  const qualityNote =
    highAmpArtifactEpochsPct > 15
      ? 'Elevated transient excursion rate (>110 µVpp). Interpret spectral averages with artifact rejection caveats.'
      : 'Nominal recording quality; minor transient excursions within exploratory tolerances.';

  return {
    lineNoiseRatioPct: Number(lineNoiseRatioPct.toFixed(2)),
    highAmpArtifactEpochsPct: Number(highAmpArtifactEpochsPct.toFixed(1)),
    flatlineChannels,
    usableDataPct: Number(usableDataPct.toFixed(1)),
    qualityNote,
  };
}

export function computeEegBandPowers(
  samples: number[],
  samplingRateHz: number
): {
  psd: ReturnType<typeof computeWelchPsd>;
  bands: BandPowerSummary[];
  totalPower: number;
} {
  const fftSize = samplingRateHz >= 256 ? 512 : 256;
  const psd = computeWelchPsd(samples, samplingRateHz, fftSize);

  const rawPowers = EEG_BANDS.map((band) => {
    let power = 0;
    for (let k = 0; k < psd.frequencies.length - 1; k++) {
      const f0 = psd.frequencies[k];
      const f1 = psd.frequencies[k + 1];
      const mid = 0.5 * (f0 + f1);
      if (mid >= band.minHz && mid < band.maxHz) {
        const df = f1 - f0;
        power += 0.5 * (psd.psd[k] + psd.psd[k + 1]) * df;
      }
    }
    return power;
  });

  const totalPower = rawPowers.reduce((acc, v) => acc + v, 0);

  const bands: BandPowerSummary[] = EEG_BANDS.map((band, idx) => ({
    band: band.band,
    rangeHz: band.rangeHz,
    minHz: band.minHz,
    maxHz: band.maxHz,
    absolutePower: rawPowers[idx],
    relativePowerPct: totalPower > 1e-12 ? (rawPowers[idx] / totalPower) * 100 : 0,
  }));

  return { psd, bands, totalPower };
}

function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSimulatedEegCondition(
  seed: number,
  conditionLabel: string,
  profile: 'noisy-exposure' | 'denoised-exposure'
): EegConditionData {
  const fs = 256;
  const durationSec = 8;
  const n = fs * durationSec;
  const timeSec = Array.from({ length: n }, (_, i) => Number((i / fs).toFixed(4)));
  const rand = seededRand(seed);

  const channelNames = ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'O1', 'O2'];
  const channels: Record<string, number[]> = {};

  channelNames.forEach((chName, chIdx) => {
    const vec = new Array<number>(n);
    const isOccipital = chName.startsWith('O');
    const isFrontal = chName.startsWith('F');

    // Exploratory spectral weights (purely illustrative simulation differences)
    const alphaGain =
      profile === 'denoised-exposure' ? (isOccipital ? 24 : 16) : isOccipital ? 13 : 9;
    const betaGain = profile === 'denoised-exposure' ? 8 : 14;
    const thetaGain = profile === 'denoised-exposure' ? 11 : 10;
    const deltaGain = 14;
    const gammaGain = profile === 'denoised-exposure' ? 3.5 : 6.0;

    const p1 = rand() * Math.PI * 2;
    const p2 = rand() * Math.PI * 2;
    const p3 = rand() * Math.PI * 2;
    const p4 = rand() * Math.PI * 2;

    let pinkState = 0;
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const white = rand() * 2 - 1;
      pinkState = 0.94 * pinkState + 0.06 * white * 14;

      const delta = deltaGain * Math.sin(2 * Math.PI * (1.8 + chIdx * 0.07) * t + p1);
      const theta = thetaGain * Math.sin(2 * Math.PI * (5.9 + chIdx * 0.11) * t + p2);
      const alpha =
        alphaGain *
        (0.75 + 0.25 * Math.sin(2 * Math.PI * 0.35 * t)) *
        Math.sin(2 * Math.PI * (10.2 + chIdx * 0.08) * t + p3);
      const beta =
        betaGain *
        (Math.sin(2 * Math.PI * 18.5 * t + p4) + 0.6 * Math.sin(2 * Math.PI * 23.2 * t + p1));
      const gamma = gammaGain * Math.sin(2 * Math.PI * 36.4 * t + p2);

      // Simulated ocular blink artifact on frontal channels around t = 2.4s and 5.8s
      let blink = 0;
      if (isFrontal) {
        blink += 58 * Math.exp(-Math.pow((t - 2.4) / 0.09, 2));
        if (profile === 'noisy-exposure') {
          blink += 52 * Math.exp(-Math.pow((t - 5.8) / 0.09, 2));
        }
      }

      // Minor 60 Hz residual line pickup
      const linePickup = (profile === 'noisy-exposure' ? 2.4 : 1.1) * Math.sin(2 * Math.PI * 60 * t);

      vec[i] = Number(
        (delta + theta + alpha + beta + gamma + pinkState + blink + linePickup).toFixed(3)
      );
    }
    channels[chName] = vec;
  });

  return {
    conditionLabel,
    samplingRateHz: fs,
    durationSec,
    channels,
    timeSec,
    artifactReport: computeEegArtifactReport(channels, fs),
  };
}

export function createSimulatedEegSessions(): EegSession[] {
  return [
    {
      id: 'eeg-sim-01',
      title: 'Session EEG-SIM-01 · Speech + HF Noise vs. Low-Pass Filtered',
      subtitle: '8-Channel 10-20 Montage · 256 Hz · Simulated Exploratory Dataset',
      createdAt: '2026-11-18T14:20:00Z',
      isSimulated: true,
      sourceLabel: 'Simulated Exploratory EEG Dataset',
      participantCode: 'SUBJ-EXP-001 (Simulated)',
      audioContextNote:
        'Paired with synthetic acoustic stimulus: broadband HF noise vs. IIR Butterworth low-pass filtered playback.',
      conditionA: generateSimulatedEegCondition(
        1041,
        'Condition A: Noisy Audio Exposure',
        'noisy-exposure'
      ),
      conditionB: generateSimulatedEegCondition(
        2082,
        'Condition B: Denoised Audio Exposure',
        'denoised-exposure'
      ),
    },
    {
      id: 'eeg-sim-02',
      title: 'Session EEG-SIM-02 · 60 Hz Mains Hum vs. Band-Stop Filtered',
      subtitle: '8-Channel 10-20 Montage · 256 Hz · Simulated Exploratory Dataset',
      createdAt: '2026-11-18T16:45:00Z',
      isSimulated: true,
      sourceLabel: 'Simulated Exploratory EEG Dataset',
      participantCode: 'SUBJ-EXP-002 (Simulated)',
      audioContextNote:
        'Paired with acoustic stimulus: 60 Hz interference vs. FIR band-stop filtered audio.',
      conditionA: generateSimulatedEegCondition(
        3095,
        'Condition A: Noisy Audio Exposure',
        'noisy-exposure'
      ),
      conditionB: generateSimulatedEegCondition(
        4123,
        'Condition B: Denoised Audio Exposure',
        'denoised-exposure'
      ),
    },
  ];
}

export function parseUploadedEegFile(
  filename: string,
  content: string,
  samplingRateHz: number
): EegConditionData {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) {
    const parsed = JSON.parse(content);
    const fs = Number(parsed.samplingRateHz || samplingRateHz || 256);
    if (!parsed.channels || typeof parsed.channels !== 'object') {
      throw new Error('JSON EEG file must contain a "channels" object mapping channel names to numeric arrays.');
    }
    const channels: Record<string, number[]> = {};
    let maxLen = 0;
    for (const [k, v] of Object.entries(parsed.channels)) {
      if (!Array.isArray(v) || v.length < 16) continue;
      const nums = v.map(Number).filter((x) => Number.isFinite(x));
      if (nums.length >= 16) {
        channels[k] = nums;
        maxLen = Math.max(maxLen, nums.length);
      }
    }
    if (Object.keys(channels).length === 0) {
      throw new Error('No valid numeric EEG channels found in JSON file.');
    }
    const timeSec = Array.from({ length: maxLen }, (_, i) => Number((i / fs).toFixed(4)));
    return {
      conditionLabel: filename,
      samplingRateHz: fs,
      durationSec: maxLen / fs,
      channels,
      timeSec,
      artifactReport: computeEegArtifactReport(channels, fs),
    };
  }

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 18) {
      throw new Error('EEG CSV must contain a header row and at least 16 numeric sample rows.');
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    const hasTimeCol =
      headers[0].toLowerCase() === 'time' ||
      headers[0].toLowerCase() === 't' ||
      headers[0].toLowerCase() === 'timestamp';
    const startCol = hasTimeCol ? 1 : 0;
    const chNames = headers.slice(startCol).filter(Boolean);
    if (chNames.length === 0) {
      throw new Error('EEG CSV header must include at least one channel column.');
    }

    const channels: Record<string, number[]> = {};
    chNames.forEach((c) => {
      channels[c] = [];
    });

    const parsedTimes: number[] = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = lines[r].split(',');
      if (cols.length < startCol + chNames.length) continue;
      if (hasTimeCol) {
        const tv = Number(cols[0]);
        if (Number.isFinite(tv)) parsedTimes.push(tv);
      }
      for (let c = 0; c < chNames.length; c++) {
        const val = Number(cols[startCol + c]);
        channels[chNames[c]].push(Number.isFinite(val) ? val : 0);
      }
    }

    const numSamples = channels[chNames[0]].length;
    if (numSamples < 16) {
      throw new Error('Parsed fewer than 16 valid EEG rows from CSV.');
    }

    let effectiveFs = samplingRateHz;
    if (parsedTimes.length >= 2) {
      const dt = parsedTimes[1] - parsedTimes[0];
      if (dt > 0.0005 && dt < 0.1) {
        effectiveFs = Math.round(1 / dt);
      }
    }

    const timeSec =
      parsedTimes.length === numSamples
        ? parsedTimes
        : Array.from({ length: numSamples }, (_, i) => Number((i / effectiveFs).toFixed(4)));

    return {
      conditionLabel: filename,
      samplingRateHz: effectiveFs,
      durationSec: numSamples / effectiveFs,
      channels,
      timeSec,
      artifactReport: computeEegArtifactReport(channels, effectiveFs),
    };
  }

  throw new Error('Unsupported EEG format. Please upload a .csv or .json EEG dataset.');
}
