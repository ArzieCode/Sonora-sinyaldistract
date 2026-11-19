import { WindowType } from '../types/sonora';

export function getWindowCoefficients(length: number, type: WindowType): Float64Array {
  const w = new Float64Array(length);
  if (length <= 1) {
    if (length === 1) w[0] = 1;
    return w;
  }
  const N = length - 1;
  for (let n = 0; n < length; n++) {
    const ratio = n / N;
    if (type === 'hann') {
      w[n] = 0.5 * (1 - Math.cos(2 * Math.PI * ratio));
    } else if (type === 'blackman') {
      w[n] =
        0.42 -
        0.5 * Math.cos(2 * Math.PI * ratio) +
        0.08 * Math.cos(4 * Math.PI * ratio);
    } else {
      // Hamming default
      w[n] = 0.54 - 0.46 * Math.cos(2 * Math.PI * ratio);
    }
  }
  return w;
}

/**
 * In-place iterative Radix-2 Cooley-Tukey FFT.
 * `re` and `im` must have power-of-2 length.
 */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tmpRe = re[i];
      re[i] = re[j];
      re[j] = tmpRe;

      const tmpIm = im[i];
      im[i] = im[j];
      im[j] = tmpIm;
    }
  }

  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wStepRe = Math.cos(angleStep);
    const wStepIm = Math.sin(angleStep);

    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < halfLen; k++) {
        const evenIdx = i + k;
        const oddIdx = evenIdx + halfLen;

        const oddRe = re[oddIdx] * wRe - im[oddIdx] * wIm;
        const oddIm = re[oddIdx] * wIm + im[oddIdx] * wRe;

        re[oddIdx] = re[evenIdx] - oddRe;
        im[oddIdx] = im[evenIdx] - oddIm;
        re[evenIdx] += oddRe;
        im[evenIdx] += oddIm;

        const nextWRe = wRe * wStepRe - wIm * wStepIm;
        wIm = wRe * wStepIm + wIm * wStepRe;
        wRe = nextWRe;
      }
    }
  }
}

export interface SpectrumPeak {
  frequencyHz: number;
  magnitudeDb: number;
  magnitudeLinear: number;
}

export interface SpectrumResult {
  frequencies: number[];
  magnitudeLinear: number[];
  magnitudeDb: number[];
  dominantPeaks: SpectrumPeak[];
  fftSize: number;
}

export function computeMagnitudeSpectrum(
  samples: Float32Array | number[],
  sampleRate: number,
  fftSize = 4096,
  windowType: WindowType = 'hann'
): SpectrumResult {
  // Choose an averaged Welch-like FFT across frames if signal > fftSize, or zero-pad if shorter
  const n = fftSize;
  const half = n >> 1;
  const win = getWindowCoefficients(n, windowType);
  let winSum = 0;
  for (let i = 0; i < n; i++) winSum += win[i];
  const normFactor = winSum > 0 ? 2 / winSum : 2 / n;

  const avgMag = new Float64Array(half + 1);
  const step = Math.max(1, n >> 1);
  const totalLen = samples.length;
  let frameCount = 0;

  const re = new Float64Array(n);
  const im = new Float64Array(n);

  if (totalLen <= n) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < totalLen; i++) {
      re[i] = samples[i] * win[i];
    }
    fftRadix2(re, im);
    for (let k = 0; k <= half; k++) {
      const mag = Math.hypot(re[k], im[k]) * normFactor;
      avgMag[k] = k === 0 || k === half ? mag * 0.5 : mag;
    }
    frameCount = 1;
  } else {
    // Sample up to 64 evenly distributed frames across the audio to keep computation fast & representative
    const maxFrames = 64;
    const possibleFrames = Math.floor((totalLen - n) / step) + 1;
    const frameStride = Math.max(1, Math.floor(possibleFrames / maxFrames));

    for (let f = 0; f < possibleFrames; f += frameStride) {
      const start = f * step;
      re.fill(0);
      im.fill(0);
      for (let i = 0; i < n; i++) {
        re[i] = samples[start + i] * win[i];
      }
      fftRadix2(re, im);
      for (let k = 0; k <= half; k++) {
        const mag = Math.hypot(re[k], im[k]) * normFactor;
        avgMag[k] += k === 0 || k === half ? mag * 0.5 : mag;
      }
      frameCount++;
    }
    if (frameCount > 0) {
      for (let k = 0; k <= half; k++) {
        avgMag[k] /= frameCount;
      }
    }
  }

  const frequencies: number[] = new Array(half + 1);
  const magnitudeLinear: number[] = new Array(half + 1);
  const magnitudeDb: number[] = new Array(half + 1);

  for (let k = 0; k <= half; k++) {
    frequencies[k] = (k * sampleRate) / n;
    const lin = avgMag[k];
    magnitudeLinear[k] = lin;
    magnitudeDb[k] = 20 * Math.log10(Math.max(lin, 1e-7));
  }

  // Peak detection (local maxima above bin 1, excluding DC bin 0)
  const candidates: SpectrumPeak[] = [];
  for (let k = 2; k < half - 1; k++) {
    if (magnitudeDb[k] > magnitudeDb[k - 1] && magnitudeDb[k] >= magnitudeDb[k + 1]) {
      candidates.push({
        frequencyHz: frequencies[k],
        magnitudeDb: magnitudeDb[k],
        magnitudeLinear: magnitudeLinear[k],
      });
    }
  }
  candidates.sort((a, b) => b.magnitudeDb - a.magnitudeDb);

  // De-cluster peaks within 25 Hz of a stronger peak
  const dominantPeaks: SpectrumPeak[] = [];
  for (const peak of candidates) {
    const tooClose = dominantPeaks.some(
      (p) => Math.abs(p.frequencyHz - peak.frequencyHz) < Math.max(25, sampleRate / n * 3)
    );
    if (!tooClose) {
      dominantPeaks.push(peak);
      if (dominantPeaks.length >= 5) break;
    }
  }

  return {
    frequencies,
    magnitudeLinear,
    magnitudeDb,
    dominantPeaks,
    fftSize: n,
  };
}

export interface SpectrogramResult {
  times: number[];
  frequencies: number[];
  zDb: number[][]; // [freqIndex][timeIndex] for Plotly heatmap
  fftSize: number;
  hopSize: number;
}

export function computeStftSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  fftSize = 1024,
  windowType: WindowType = 'hann',
  maxTimeFrames = 180
): SpectrogramResult {
  const n = fftSize;
  const half = n >> 1;
  const totalLen = samples.length;

  if (totalLen < 64) {
    return { times: [0], frequencies: [0], zDb: [[-120]], fftSize: n, hopSize: n >> 2 };
  }

  const baseHop = Math.max(64, n >> 2);
  const rawFrames = Math.max(1, Math.floor((totalLen - n) / baseHop) + 1);
  const hopSize =
    rawFrames > maxTimeFrames
      ? Math.max(baseHop, Math.floor((totalLen - n) / maxTimeFrames))
      : baseHop;

  const numFrames = Math.max(1, Math.floor(Math.max(0, totalLen - n) / hopSize) + 1);
  const win = getWindowCoefficients(n, windowType);
  let winSum = 0;
  for (let i = 0; i < n; i++) winSum += win[i];
  const norm = winSum > 0 ? 2 / winSum : 2 / n;

  // Limit frequency bins rendered to 256 max for fluid interactive heatmap rendering
  const freqStride = Math.max(1, Math.floor((half + 1) / 256));
  const freqIndices: number[] = [];
  for (let k = 0; k <= half; k += freqStride) {
    freqIndices.push(k);
  }

  const frequencies = freqIndices.map((k) => (k * sampleRate) / n);
  const times: number[] = new Array(numFrames);
  const zDb: number[][] = freqIndices.map(() => new Array(numFrames));

  const re = new Float64Array(n);
  const im = new Float64Array(n);

  for (let t = 0; t < numFrames; t++) {
    const start = t * hopSize;
    times[t] = (start + n * 0.5) / sampleRate;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < n && start + i < totalLen; i++) {
      re[i] = samples[start + i] * win[i];
    }
    fftRadix2(re, im);

    for (let fi = 0; fi < freqIndices.length; fi++) {
      const k = freqIndices[fi];
      const mag = Math.hypot(re[k], im[k]) * norm;
      const db = Math.max(-110, 20 * Math.log10(Math.max(mag, 1e-6)));
      zDb[fi][t] = Number(db.toFixed(2));
    }
  }

  return {
    times,
    frequencies,
    zDb,
    fftSize: n,
    hopSize,
  };
}

export interface PsdResult {
  frequencies: number[];
  psd: number[]; // unit^2 / Hz
  psdDb: number[];
}

export function computeWelchPsd(
  samples: number[] | Float32Array,
  sampleRate: number,
  fftSize = 512
): PsdResult {
  const n = fftSize;
  const half = n >> 1;
  const win = getWindowCoefficients(n, 'hann');
  let winSqSum = 0;
  for (let i = 0; i < n; i++) winSqSum += win[i] * win[i];
  const scale = 1 / (sampleRate * winSqSum);

  const psdAccum = new Float64Array(half + 1);
  const hop = Math.max(1, n >> 1);
  const totalLen = samples.length;

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let segments = 0;

  if (totalLen <= n) {
    re.fill(0);
    im.fill(0);
    // Remove mean
    let mean = 0;
    for (let i = 0; i < totalLen; i++) mean += samples[i];
    mean /= Math.max(1, totalLen);
    for (let i = 0; i < totalLen; i++) {
      re[i] = (samples[i] - mean) * win[i];
    }
    fftRadix2(re, im);
    for (let k = 0; k <= half; k++) {
      const p = (re[k] * re[k] + im[k] * im[k]) * scale;
      psdAccum[k] = k === 0 || k === half ? p : p * 2;
    }
    segments = 1;
  } else {
    for (let start = 0; start + n <= totalLen; start += hop) {
      let mean = 0;
      for (let i = 0; i < n; i++) mean += samples[start + i];
      mean /= n;

      re.fill(0);
      im.fill(0);
      for (let i = 0; i < n; i++) {
        re[i] = (samples[start + i] - mean) * win[i];
      }
      fftRadix2(re, im);
      for (let k = 0; k <= half; k++) {
        const p = (re[k] * re[k] + im[k] * im[k]) * scale;
        psdAccum[k] += k === 0 || k === half ? p : p * 2;
      }
      segments++;
    }
    if (segments > 0) {
      for (let k = 0; k <= half; k++) psdAccum[k] /= segments;
    }
  }

  const frequencies: number[] = new Array(half + 1);
  const psd: number[] = new Array(half + 1);
  const psdDb: number[] = new Array(half + 1);

  for (let k = 0; k <= half; k++) {
    frequencies[k] = (k * sampleRate) / n;
    psd[k] = psdAccum[k];
    psdDb[k] = 10 * Math.log10(Math.max(psdAccum[k], 1e-12));
  }

  return { frequencies, psd, psdDb };
}
