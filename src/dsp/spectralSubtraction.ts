import { fftRadix2, getWindowCoefficients } from './fft';

export interface SpectralSubtractionConfig {
  frameSize: 256 | 512 | 1024 | 2048;
  overlapRatio: 0.5 | 0.75;
  subtractionFactor: number; // alpha (e.g. 1.0 - 3.5)
  noiseSource: 'initial-segment' | 'minimum-percentile';
  noiseSegmentSec: number;
}

function ifftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fftRadix2(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

/**
 * Estimates noise magnitude spectrum from either the initial noise-only segment
 * or the 15th-percentile frame power across the recording.
 */
function estimateNoiseMagnitude(
  samples: Float32Array,
  sampleRate: number,
  frameSize: number,
  hopSize: number,
  win: Float64Array,
  source: SpectralSubtractionConfig['noiseSource'],
  noiseSegmentSec: number
): Float64Array {
  const half = frameSize >> 1;
  const noiseMag = new Float64Array(half + 1);
  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);

  const totalFrames = Math.max(1, Math.floor((samples.length - frameSize) / hopSize) + 1);

  if (source === 'initial-segment') {
    const noiseSamples = Math.min(
      samples.length,
      Math.max(frameSize, Math.floor(noiseSegmentSec * sampleRate))
    );
    const noiseFrames = Math.max(
      1,
      Math.floor((noiseSamples - frameSize) / hopSize) + 1
    );

    for (let f = 0; f < noiseFrames; f++) {
      const start = f * hopSize;
      re.fill(0);
      im.fill(0);
      for (let i = 0; i < frameSize && start + i < samples.length; i++) {
        re[i] = samples[start + i] * win[i];
      }
      fftRadix2(re, im);
      for (let k = 0; k <= half; k++) {
        noiseMag[k] += Math.hypot(re[k], im[k]);
      }
    }
    for (let k = 0; k <= half; k++) {
      noiseMag[k] /= noiseFrames;
    }
    return noiseMag;
  }

  // Minimum-percentile statistics across sampled frames
  const stride = Math.max(1, Math.floor(totalFrames / 80));
  const perBinFrames: number[][] = Array.from({ length: half + 1 }, () => []);

  for (let f = 0; f < totalFrames; f += stride) {
    const start = f * hopSize;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < frameSize && start + i < samples.length; i++) {
      re[i] = samples[start + i] * win[i];
    }
    fftRadix2(re, im);
    for (let k = 0; k <= half; k++) {
      perBinFrames[k].push(Math.hypot(re[k], im[k]));
    }
  }

  for (let k = 0; k <= half; k++) {
    const arr = perBinFrames[k].sort((a, b) => a - b);
    const idx = Math.min(arr.length - 1, Math.floor(arr.length * 0.15));
    noiseMag[k] = arr[idx] ?? 0;
  }
  return noiseMag;
}

/**
 * Boll / Berouti Spectral Subtraction with half-wave rectification and spectral floor.
 */
export function spectralSubtractChannel(
  input: Float32Array,
  sampleRate: number,
  config: SpectralSubtractionConfig
): Float32Array {
  const N = config.frameSize;
  const hop = Math.max(32, Math.round(N * (1 - config.overlapRatio)));
  const half = N >> 1;
  const win = getWindowCoefficients(N, 'hann');
  const spectralFloor = 0.04;

  const noiseMag = estimateNoiseMagnitude(
    input,
    sampleRate,
    N,
    hop,
    win,
    config.noiseSource,
    config.noiseSegmentSec
  );

  const out = new Float64Array(input.length);
  const norm = new Float64Array(input.length);

  const re = new Float64Array(N);
  const im = new Float64Array(N);

  for (let start = 0; start < input.length; start += hop) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < N && start + i < input.length; i++) {
      re[i] = input[start + i] * win[i];
    }

    fftRadix2(re, im);

    for (let k = 0; k <= half; k++) {
      const mag = Math.hypot(re[k], im[k]);
      const phase = Math.atan2(im[k], re[k]);
      const subtracted = Math.max(
        spectralFloor * noiseMag[k],
        mag - config.subtractionFactor * noiseMag[k]
      );
      const newRe = subtracted * Math.cos(phase);
      const newIm = subtracted * Math.sin(phase);

      re[k] = newRe;
      im[k] = newIm;
      if (k > 0 && k < half) {
        re[N - k] = newRe;
        im[N - k] = -newIm;
      }
    }

    ifftRadix2(re, im);

    for (let i = 0; i < N && start + i < input.length; i++) {
      out[start + i] += re[i] * win[i];
      norm[start + i] += win[i] * win[i];
    }
  }

  const result = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const val = norm[i] > 1e-8 ? out[i] / norm[i] : input[i];
    result[i] = Math.max(-1, Math.min(1, val));
  }
  return result;
}
