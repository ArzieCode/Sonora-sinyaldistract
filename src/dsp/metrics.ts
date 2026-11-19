import { ReferenceComparisonMetrics, SignalMetrics } from '../types/sonora';

export function computeSignalMetrics(
  samples: Float32Array,
  sampleRate: number,
  channels: number
): SignalMetrics {
  const n = samples.length;
  if (n === 0) {
    return {
      durationSec: 0,
      sampleRate,
      channels,
      sampleCount: 0,
      maxAmplitude: 0,
      minAmplitude: 0,
      rmsAmplitude: 0,
      peakToPeak: 0,
      crestFactor: 0,
    };
  }

  let max = -Infinity;
  let min = Infinity;
  let sumSq = 0;

  for (let i = 0; i < n; i++) {
    const v = samples[i];
    if (v > max) max = v;
    if (v < min) min = v;
    sumSq += v * v;
  }

  const rms = Math.sqrt(sumSq / n);
  const peakAbs = Math.max(Math.abs(max), Math.abs(min));
  const crestFactor = rms > 1e-12 ? peakAbs / rms : 0;

  return {
    durationSec: n / sampleRate,
    sampleRate,
    channels,
    sampleCount: n,
    maxAmplitude: max,
    minAmplitude: min,
    rmsAmplitude: rms,
    peakToPeak: max - min,
    crestFactor,
  };
}

/**
 * Computes SNR, MSE, and RMSE strictly from an aligned clean reference signal.
 * Never invents or estimates values when reference is unavailable.
 */
export function computeReferenceMetrics(
  noisy: Float32Array,
  processed: Float32Array,
  reference: Float32Array | null
): ReferenceComparisonMetrics {
  if (!reference || reference.length === 0) {
    return {
      hasReference: false,
      inputSnrDb: null,
      outputSnrDb: null,
      snrImprovementDb: null,
      mse: null,
      rmse: null,
      alignedSamples: 0,
    };
  }

  const len = Math.min(noisy.length, processed.length, reference.length);
  if (len === 0) {
    return {
      hasReference: false,
      inputSnrDb: null,
      outputSnrDb: null,
      snrImprovementDb: null,
      mse: null,
      rmse: null,
      alignedSamples: 0,
    };
  }

  let refPower = 0;
  let inputNoisePower = 0;
  let outputErrorPower = 0;

  for (let i = 0; i < len; i++) {
    const r = reference[i];
    const eIn = noisy[i] - r;
    const eOut = processed[i] - r;
    refPower += r * r;
    inputNoisePower += eIn * eIn;
    outputErrorPower += eOut * eOut;
  }

  const mse = outputErrorPower / len;
  const rmse = Math.sqrt(mse);

  const inputSnrDb =
    inputNoisePower > 1e-15 ? 10 * Math.log10(refPower / inputNoisePower) : 100;
  const outputSnrDb =
    outputErrorPower > 1e-15 ? 10 * Math.log10(refPower / outputErrorPower) : 100;

  return {
    hasReference: true,
    inputSnrDb,
    outputSnrDb,
    snrImprovementDb: outputSnrDb - inputSnrDb,
    mse,
    rmse,
    alignedSamples: len,
  };
}

export interface DownsampledWaveform {
  times: number[];
  amplitudes: number[];
}

/**
 * Min-max envelope decimation so long audio files render crisply in Plotly without dropping transients.
 */
export function downsampleWaveform(
  samples: Float32Array,
  sampleRate: number,
  maxPoints = 2400
): DownsampledWaveform {
  const n = samples.length;
  if (n === 0) return { times: [], amplitudes: [] };

  if (n <= maxPoints) {
    const times = new Array<number>(n);
    const amplitudes = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      times[i] = i / sampleRate;
      amplitudes[i] = samples[i];
    }
    return { times, amplitudes };
  }

  const buckets = Math.floor(maxPoints / 2);
  const bucketSize = n / buckets;
  const times: number[] = [];
  const amplitudes: number[] = [];

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(n, Math.floor((b + 1) * bucketSize));
    let minVal = Infinity;
    let maxVal = -Infinity;
    let minIdx = start;
    let maxIdx = start;

    for (let i = start; i < end; i++) {
      const v = samples[i];
      if (v < minVal) {
        minVal = v;
        minIdx = i;
      }
      if (v > maxVal) {
        maxVal = v;
        maxIdx = i;
      }
    }

    if (minIdx <= maxIdx) {
      times.push(minIdx / sampleRate, maxIdx / sampleRate);
      amplitudes.push(minVal, maxVal);
    } else {
      times.push(maxIdx / sampleRate, minIdx / sampleRate);
      amplitudes.push(maxVal, minVal);
    }
  }

  return { times, amplitudes };
}
