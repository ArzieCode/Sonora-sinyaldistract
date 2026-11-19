import { encodeWavBlob } from './audioUtils';
import { AudioSignalData } from '../types/sonora';

export type DataScenario = 'A' | 'B' | 'C';
export type SyntheticNoiseKind = 'white' | 'hum50';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a deterministic clean acoustic reference signal (harmonic voice-like bursts)
 * or uses an existing clean buffer, then adds white noise or 50 Hz hum at an exact target SNR (dB).
 */
export function buildScenarioAPair(
  noiseKind: SyntheticNoiseKind,
  targetSnrDb: number,
  existingClean?: AudioSignalData | null
): { noisy: AudioSignalData; cleanReference: AudioSignalData } {
  const sampleRate = existingClean ? existingClean.sampleRate : 16000;
  const durationSec = existingClean ? existingClean.durationSec : 4.0;
  const n = existingClean ? existingClean.samples.length : Math.floor(sampleRate * durationSec);

  const clean = new Float32Array(n);
  if (existingClean) {
    clean.set(existingClean.samples);
  } else {
    // 2 seconds of clean harmonic tone bursts preceded by 0.5s pause
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      const env =
        0.6 * Math.exp(-Math.pow((t - 1.1) / 0.35, 2)) +
        0.75 * Math.exp(-Math.pow((t - 2.1) / 0.38, 2)) +
        0.65 * Math.exp(-Math.pow((t - 3.1) / 0.32, 2));
      clean[i] =
        env *
        (0.55 * Math.sin(2 * Math.PI * 240 * t) +
          0.3 * Math.sin(2 * Math.PI * 480 * t) +
          0.15 * Math.sin(2 * Math.PI * 720 * t));
    }
  }

  // Generate unit-variance raw noise vector
  const rawNoise = new Float32Array(n);
  const rand = mulberry32(noiseKind === 'white' ? 7301 : 5050);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    if (noiseKind === 'white') {
      rawNoise[i] = rand() * 2 - 1;
    } else {
      // 50 Hz fundamental mains hum + odd harmonics (150 Hz, 250 Hz) + slight thermal floor
      rawNoise[i] =
        0.78 * Math.sin(2 * Math.PI * 50 * t) +
        0.25 * Math.sin(2 * Math.PI * 150 * t) +
        0.12 * Math.sin(2 * Math.PI * 250 * t) +
        (rand() * 2 - 1) * 0.04;
    }
  }

  // Scale noise to achieve exact requested input SNR (dB)
  let sigPower = 0;
  let noisePower = 0;
  for (let i = 0; i < n; i++) {
    sigPower += clean[i] * clean[i];
    noisePower += rawNoise[i] * rawNoise[i];
  }
  const desiredNoisePower = sigPower / Math.pow(10, targetSnrDb / 10);
  const scale = noisePower > 1e-12 ? Math.sqrt(desiredNoisePower / noisePower) : 0;

  const noisy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    noisy[i] = Math.max(-0.99, Math.min(0.99, clean[i] + rawNoise[i] * scale));
  }

  const cleanBlob = encodeWavBlob([clean], sampleRate);
  const noisyBlob = encodeWavBlob([noisy], sampleRate);
  const noiseTag = noiseKind === 'white' ? 'white_noise' : 'hum_50hz';

  return {
    cleanReference: existingClean ?? {
      id: `scenA-clean-${Date.now()}`,
      name: `skenarioA_referensi_bersih.wav`,
      format: 'WAV',
      fileSizeBytes: cleanBlob.size,
      durationSec,
      sampleRate,
      channels: 1,
      samples: clean,
      channelBuffers: [clean],
      blobUrl: URL.createObjectURL(cleanBlob),
      isDemoData: true,
      loadedAt: new Date().toISOString(),
    },
    noisy: {
      id: `scenA-noisy-${noiseTag}-${targetSnrDb}`,
      name: `skenarioA_${noiseTag}_${targetSnrDb}dB.wav`,
      format: 'WAV',
      fileSizeBytes: noisyBlob.size,
      durationSec,
      sampleRate,
      channels: 1,
      samples: noisy,
      channelBuffers: [noisy],
      blobUrl: URL.createObjectURL(noisyBlob),
      isDemoData: !existingClean,
      loadedAt: new Date().toISOString(),
    },
  };
}

/**
 * Generates a realistic Scenario B demonstration recording with an initial noise-only segment
 * (default 2 seconds) followed by speech-like harmonic activity.
 */
export function buildScenarioBDemoSignal(noiseSegmentSec = 2.0): AudioSignalData {
  const sampleRate = 16000;
  const durationSec = Math.max(4.5, noiseSegmentSec + 3.0);
  const n = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(n);
  const rand = mulberry32(9912);

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const backgroundNoise =
      0.08 * Math.sin(2 * Math.PI * 50 * t) +
      0.05 * Math.sin(2 * Math.PI * 3600 * t) +
      (rand() * 2 - 1) * 0.07;

    let signal = 0;
    if (t >= noiseSegmentSec) {
      const dt = t - noiseSegmentSec;
      const env =
        0.65 * Math.exp(-Math.pow((dt - 0.8) / 0.32, 2)) +
        0.72 * Math.exp(-Math.pow((dt - 1.9) / 0.36, 2));
      signal =
        env *
        (0.55 * Math.sin(2 * Math.PI * 220 * t) +
          0.28 * Math.sin(2 * Math.PI * 440 * t) +
          0.16 * Math.sin(2 * Math.PI * 660 * t));
    }
    samples[i] = Math.max(-0.99, Math.min(0.99, signal + backgroundNoise));
  }

  const blob = encodeWavBlob([samples], sampleRate);
  return {
    id: `scenB-demo-${Date.now()}`,
    name: `skenarioB_rekaman_bising_awal_${noiseSegmentSec}s.wav`,
    format: 'WAV',
    fileSizeBytes: blob.size,
    durationSec,
    sampleRate,
    channels: 1,
    samples,
    channelBuffers: [samples],
    blobUrl: URL.createObjectURL(blob),
    isDemoData: true,
    loadedAt: new Date().toISOString(),
  };
}

/**
 * Estimates Input and Output SNR (dB) from an initial noise-only segment
 * when no clean reference signal is available (Scenario B).
 */
export function estimateSnrFromNoiseSegment(
  noisy: Float32Array,
  processed: Float32Array,
  sampleRate: number,
  noiseSegmentSec: number
): { inputSnrEstDb: number; outputSnrEstDb: number; snrGainDb: number } {
  const noiseCount = Math.min(
    Math.floor(noisy.length * 0.75),
    Math.max(128, Math.floor(noiseSegmentSec * sampleRate))
  );

  let inNoisePow = 0;
  let outNoisePow = 0;
  for (let i = 0; i < noiseCount; i++) {
    inNoisePow += noisy[i] * noisy[i];
    outNoisePow += processed[i] * processed[i];
  }
  inNoisePow /= noiseCount;
  outNoisePow /= noiseCount;

  const activeStart = noiseCount;
  const activeCount = Math.max(1, noisy.length - activeStart);
  let inTotalPow = 0;
  let outTotalPow = 0;
  for (let i = activeStart; i < noisy.length; i++) {
    inTotalPow += noisy[i] * noisy[i];
    outTotalPow += processed[i] * processed[i];
  }
  inTotalPow /= activeCount;
  outTotalPow /= activeCount;

  const inSigPow = Math.max(1e-12, inTotalPow - inNoisePow);
  const outSigPow = Math.max(1e-12, outTotalPow - outNoisePow);

  const inputSnrEstDb = 10 * Math.log10(inSigPow / Math.max(1e-12, inNoisePow));
  const outputSnrEstDb = 10 * Math.log10(outSigPow / Math.max(1e-12, outNoisePow));

  return {
    inputSnrEstDb,
    outputSnrEstDb,
    snrGainDb: outputSnrEstDb - inputSnrEstDb,
  };
}
