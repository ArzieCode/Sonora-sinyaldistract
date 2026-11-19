import {
  ComplexNumber,
  FilterConfig,
  FilterDesignResult,
  WindowType,
} from '../types/sonora';
import { getWindowCoefficients } from './fft';

// Complex arithmetic helpers
function cAdd(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cMul(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function cDiv(a: ComplexNumber, b: ComplexNumber): ComplexNumber {
  const denom = b.re * b.re + b.im * b.im;
  if (denom < 1e-18) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

function cSqrt(z: ComplexNumber): ComplexNumber {
  const r = Math.hypot(z.re, z.im);
  const theta = Math.atan2(z.im, z.re);
  const sr = Math.sqrt(r);
  return {
    re: sr * Math.cos(theta / 2),
    im: sr * Math.sin(theta / 2),
  };
}

function cMag(z: ComplexNumber): number {
  return Math.hypot(z.re, z.im);
}

/**
 * Expand product_i (1 - roots[i] * z^-1) into polynomial coefficients [c0, c1, ..., cn]
 */
function expandRootsToPoly(roots: ComplexNumber[]): number[] {
  let poly: ComplexNumber[] = [{ re: 1, im: 0 }];
  for (const r of roots) {
    const next: ComplexNumber[] = new Array(poly.length + 1)
      .fill(null)
      .map(() => ({ re: 0, im: 0 }));
    for (let i = 0; i < poly.length; i++) {
      next[i] = cAdd(next[i], poly[i]);
      const term = cMul(poly[i], { re: -r.re, im: -r.im });
      next[i + 1] = cAdd(next[i + 1], term);
    }
    poly = next;
  }
  return poly.map((c) => (Math.abs(c.re) < 1e-14 ? 0 : c.re));
}

function evalPolyAtZInv(coeffs: number[], omega: number): ComplexNumber {
  let re = 0;
  let im = 0;
  for (let k = 0; k < coeffs.length; k++) {
    const angle = -k * omega;
    re += coeffs[k] * Math.cos(angle);
    im += coeffs[k] * Math.sin(angle);
  }
  return { re, im };
}

function sinc(x: number): number {
  if (Math.abs(x) < 1e-12) return 1;
  return Math.sin(Math.PI * x) / (Math.PI * x);
}

function designFirKernel(
  type: FilterConfig['type'],
  cutoffHz: number,
  cutoffHighHz: number,
  order: number,
  sampleRate: number,
  windowType: WindowType
): number[] {
  // Ensure even order (odd number of taps) for linear-phase symmetric high-pass/band-stop
  const evenOrder = order % 2 === 0 ? order : order + 1;
  const M = Math.max(4, evenOrder);
  const N = M + 1;
  const half = M / 2;
  const win = getWindowCoefficients(N, windowType);

  const nyquist = sampleRate / 2;
  const fc1 = Math.max(1, Math.min(cutoffHz, nyquist * 0.96));
  const fc2 = Math.max(fc1 + 10, Math.min(cutoffHighHz, nyquist * 0.98));

  const fn1 = fc1 / sampleRate;
  const fn2 = fc2 / sampleRate;

  const lp1 = new Array<number>(N);
  const lp2 = new Array<number>(N);

  for (let n = 0; n < N; n++) {
    const m = n - half;
    lp1[n] = 2 * fn1 * sinc(2 * fn1 * m) * win[n];
    lp2[n] = 2 * fn2 * sinc(2 * fn2 * m) * win[n];
  }

  // Normalize LP kernels to unity DC gain
  const sum1 = lp1.reduce((acc, v) => acc + v, 0);
  const sum2 = lp2.reduce((acc, v) => acc + v, 0);
  if (Math.abs(sum1) > 1e-12) for (let n = 0; n < N; n++) lp1[n] /= sum1;
  if (Math.abs(sum2) > 1e-12) for (let n = 0; n < N; n++) lp2[n] /= sum2;

  if (type === 'lowpass') {
    return lp1;
  }

  if (type === 'highpass') {
    const hp = lp1.map((v, n) => (n === half ? 1 - v : -v));
    return hp;
  }

  if (type === 'bandpass') {
    const bp = lp2.map((v, n) => v - lp1[n]);
    // Normalize at center frequency
    const w0 = (Math.PI * (fc1 + fc2)) / sampleRate;
    const h0 = evalPolyAtZInv(bp, w0);
    const gain = cMag(h0);
    return gain > 1e-12 ? bp.map((v) => v / gain) : bp;
  }

  // bandstop: delta[n - half] - bandpass
  const bpRaw = lp2.map((v, n) => v - lp1[n]);
  const bs = bpRaw.map((v, n) => (n === half ? 1 - v : -v));
  const dcSum = bs.reduce((acc, v) => acc + v, 0);
  return Math.abs(dcSum) > 1e-12 ? bs.map((v) => v / dcSum) : bs;
}

interface BiquadSection {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

interface IirButterworthData {
  b: number[];
  a: number[];
  zeros: ComplexNumber[];
  poles: ComplexNumber[];
  biquads: BiquadSection[];
}

function pairRootsToBiquads(
  zeros: ComplexNumber[],
  poles: ComplexNumber[],
  gain: number
): BiquadSection[] {
  // Group conjugate pairs for numerical stability in SOS cascade
  const usedP = new Array(poles.length).fill(false);
  const usedZ = new Array(zeros.length).fill(false);

  const pairList = (roots: ComplexNumber[], used: boolean[]): ComplexNumber[][] => {
    const groups: ComplexNumber[][] = [];
    for (let i = 0; i < roots.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const r = roots[i];
      if (Math.abs(r.im) > 1e-7) {
        // Find conjugate
        let bestIdx = -1;
        let bestDist = Infinity;
        for (let j = i + 1; j < roots.length; j++) {
          if (used[j]) continue;
          const dist = Math.hypot(roots[j].re - r.re, roots[j].im + r.im);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = j;
          }
        }
        if (bestIdx >= 0) {
          used[bestIdx] = true;
          groups.push([r, roots[bestIdx]]);
          continue;
        }
      }
      // Real root: pair with next available real root if one exists
      let realPair = -1;
      for (let j = i + 1; j < roots.length; j++) {
        if (!used[j] && Math.abs(roots[j].im) <= 1e-7) {
          realPair = j;
          break;
        }
      }
      if (realPair >= 0) {
        used[realPair] = true;
        groups.push([r, roots[realPair]]);
      } else {
        groups.push([r]);
      }
    }
    return groups;
  };

  const pGroups = pairList(poles, usedP);
  const zGroups = pairList(zeros, usedZ);
  const count = Math.max(pGroups.length, zGroups.length);
  const sections: BiquadSection[] = [];

  for (let i = 0; i < count; i++) {
    const zg = zGroups[i] ?? [];
    const pg = pGroups[i] ?? [];
    const bPoly = expandRootsToPoly(zg);
    const aPoly = expandRootsToPoly(pg);
    const scale = i === 0 ? gain : 1;

    sections.push({
      b0: (bPoly[0] ?? 1) * scale,
      b1: (bPoly[1] ?? 0) * scale,
      b2: (bPoly[2] ?? 0) * scale,
      a1: aPoly[1] ?? 0,
      a2: aPoly[2] ?? 0,
    });
  }
  return sections;
}

function designButterworthIir(
  type: FilterConfig['type'],
  cutoffHz: number,
  cutoffHighHz: number,
  order: number,
  sampleRate: number
): IirButterworthData {
  const N = Math.max(1, Math.min(10, Math.round(order)));
  const nyquist = sampleRate / 2;
  const fc1 = Math.max(1, Math.min(cutoffHz, nyquist * 0.96));
  const fc2 = Math.max(fc1 + 10, Math.min(cutoffHighHz, nyquist * 0.98));

  // Analog prototype Butterworth poles (unit circle in left half-plane)
  const protoPoles: ComplexNumber[] = [];
  for (let k = 0; k < N; k++) {
    const angle = (Math.PI * (2 * k + N + 1)) / (2 * N);
    protoPoles.push({ re: Math.cos(angle), im: Math.sin(angle) });
  }

  // Bilinear transform constant T_s = 1/fs -> 2*fs
  const twoFs = 2 * sampleRate;
  const bilinear = (s: ComplexNumber): ComplexNumber => {
    const num = { re: twoFs + s.re, im: s.im };
    const den = { re: twoFs - s.re, im: -s.im };
    return cDiv(num, den);
  };

  const zPoles: ComplexNumber[] = [];
  const zZeros: ComplexNumber[] = [];

  if (type === 'lowpass') {
    const wc = twoFs * Math.tan((Math.PI * fc1) / sampleRate);
    for (const p of protoPoles) {
      zPoles.push(bilinear({ re: p.re * wc, im: p.im * wc }));
      zZeros.push({ re: -1, im: 0 });
    }
  } else if (type === 'highpass') {
    const wc = twoFs * Math.tan((Math.PI * fc1) / sampleRate);
    for (const p of protoPoles) {
      // s -> wc / p
      const s = cDiv({ re: wc, im: 0 }, p);
      zPoles.push(bilinear(s));
      zZeros.push({ re: 1, im: 0 });
    }
  } else if (type === 'bandpass') {
    const w1 = twoFs * Math.tan((Math.PI * fc1) / sampleRate);
    const w2 = twoFs * Math.tan((Math.PI * fc2) / sampleRate);
    const bw = w2 - w1;
    const w0Sq = w1 * w2;

    for (const p of protoPoles) {
      // s^2 - (bw * p) s + w0^2 = 0
      const bTerm = { re: bw * p.re, im: bw * p.im };
      const bSq = cMul(bTerm, bTerm);
      const disc = cSqrt({ re: bSq.re - 4 * w0Sq, im: bSq.im });
      const s1 = { re: 0.5 * (bTerm.re + disc.re), im: 0.5 * (bTerm.im + disc.im) };
      const s2 = { re: 0.5 * (bTerm.re - disc.re), im: 0.5 * (bTerm.im - disc.im) };
      zPoles.push(bilinear(s1), bilinear(s2));
      zZeros.push({ re: 1, im: 0 }, { re: -1, im: 0 });
    }
  } else {
    // bandstop
    const w1 = twoFs * Math.tan((Math.PI * fc1) / sampleRate);
    const w2 = twoFs * Math.tan((Math.PI * fc2) / sampleRate);
    const bw = w2 - w1;
    const w0 = Math.sqrt(w1 * w2);
    const w0Sq = w1 * w2;

    for (const p of protoPoles) {
      // s^2 - (bw / p) s + w0^2 = 0
      const bTerm = cDiv({ re: bw, im: 0 }, p);
      const bSq = cMul(bTerm, bTerm);
      const disc = cSqrt({ re: bSq.re - 4 * w0Sq, im: bSq.im });
      const s1 = { re: 0.5 * (bTerm.re + disc.re), im: 0.5 * (bTerm.im + disc.im) };
      const s2 = { re: 0.5 * (bTerm.re - disc.re), im: 0.5 * (bTerm.im - disc.im) };
      zPoles.push(bilinear(s1), bilinear(s2));
      // Zeros at s = +/- j*w0
      zZeros.push(bilinear({ re: 0, im: w0 }), bilinear({ re: 0, im: -w0 }));
    }
  }

  const rawB = expandRootsToPoly(zZeros);
  const a = expandRootsToPoly(zPoles);

  // Compute passband normalization frequency
  let refOmega = 0;
  if (type === 'highpass') {
    refOmega = Math.PI;
  } else if (type === 'bandpass') {
    refOmega = (Math.PI * (fc1 + fc2)) / sampleRate;
  } else {
    refOmega = 0;
  }

  const numAtRef = evalPolyAtZInv(rawB, refOmega);
  const denAtRef = evalPolyAtZInv(a, refOmega);
  const rawGain = cMag(cDiv(numAtRef, denAtRef));
  const gain = rawGain > 1e-18 ? 1 / rawGain : 1;

  const b = rawB.map((v) => v * gain);
  const biquads = pairRootsToBiquads(zZeros, zPoles, gain);

  return { b, a, zeros: zZeros, poles: zPoles, biquads };
}

function buildDifferenceEquation(b: number[], a: number[]): string {
  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs < 1e-5) return v.toExponential(2);
    return v.toFixed(5);
  };

  const maxDisplay = 5;
  const xTerms: string[] = [];
  for (let k = 0; k < Math.min(b.length, maxDisplay); k++) {
    const coeff = fmt(b[k]);
    xTerms.push(k === 0 ? `${coeff}·x[n]` : `${coeff}·x[n-${k}]`);
  }
  if (b.length > maxDisplay) {
    xTerms.push(`… + ${fmt(b[b.length - 1])}·x[n-${b.length - 1}]`);
  }

  const yTerms: string[] = [];
  for (let k = 1; k < Math.min(a.length, maxDisplay); k++) {
    const coeff = fmt(-a[k]);
    yTerms.push(`${coeff}·y[n-${k}]`);
  }
  if (a.length > maxDisplay) {
    yTerms.push(`… + ${fmt(-a[a.length - 1])}·y[n-${a.length - 1}]`);
  }

  if (yTerms.length === 0) {
    return `y[n] = ${xTerms.join(' + ')}`;
  }
  return `y[n] = ${xTerms.join(' + ')} + ${yTerms.join(' + ')}`;
}

export function designDigitalFilter(config: FilterConfig): FilterDesignResult {
  const fs = Math.max(100, config.sampleRate);
  let b: number[] = [];
  let a: number[] = [1];
  let zeros: ComplexNumber[] = [];
  let poles: ComplexNumber[] = [];
  let biquads: BiquadSection[] = [];

  if (config.architecture === 'FIR') {
    b = designFirKernel(
      config.type,
      config.cutoffHz,
      config.cutoffHighHz,
      config.order,
      fs,
      config.windowType
    );
    a = [1];
    // FIR has all poles at the origin (z = 0)
    poles = new Array(Math.max(1, b.length - 1)).fill({ re: 0, im: 0 });
  } else {
    const iir = designButterworthIir(
      config.type,
      config.cutoffHz,
      config.cutoffHighHz,
      config.order,
      fs
    );
    b = iir.b;
    a = iir.a;
    zeros = iir.zeros;
    poles = iir.poles;
    biquads = iir.biquads;
  }

  const maxPoleMagnitude = poles.reduce((max, p) => Math.max(max, cMag(p)), 0);
  const isStable = config.architecture === 'FIR' || maxPoleMagnitude < 1.0 - 1e-9;

  // Evaluate frequency response across 512 frequency points [0, fs/2]
  const numFreqPts = 512;
  const frequencies = new Array<number>(numFreqPts);
  const magnitudeDb = new Array<number>(numFreqPts);
  const phaseDeg = new Array<number>(numFreqPts);

  for (let i = 0; i < numFreqPts; i++) {
    const f = (i / (numFreqPts - 1)) * (fs / 2);
    const omega = (2 * Math.PI * f) / fs;
    frequencies[i] = f;

    let H: ComplexNumber;
    if (config.architecture === 'FIR') {
      H = evalPolyAtZInv(b, omega);
    } else {
      // Evaluate via cascaded biquads for maximum precision
      H = { re: 1, im: 0 };
      for (const sec of biquads) {
        const num = evalPolyAtZInv([sec.b0, sec.b1, sec.b2], omega);
        const den = evalPolyAtZInv([1, sec.a1, sec.a2], omega);
        H = cMul(H, cDiv(num, den));
      }
    }

    const mag = cMag(H);
    magnitudeDb[i] = Math.max(-100, 20 * Math.log10(Math.max(mag, 1e-6)));
    phaseDeg[i] = (Math.atan2(H.im, H.re) * 180) / Math.PI;
  }

  // Impulse response h[n]
  const impulseLen =
    config.architecture === 'FIR' ? b.length : Math.min(128, Math.max(48, config.order * 12));
  const unitImpulse = new Float32Array(impulseLen);
  unitImpulse[0] = 1;
  const hOut =
    config.architecture === 'FIR'
      ? applyFirCausal(unitImpulse, b)
      : applyBiquadsCausal(unitImpulse, biquads);

  const impulseResponse = Array.from(hOut);
  const impulseTimeSamples = impulseResponse.map((_, idx) => idx);

  return {
    config,
    b,
    a,
    zeros,
    poles,
    isStable,
    maxPoleMagnitude,
    frequencies,
    magnitudeDb,
    phaseDeg,
    impulseResponse,
    impulseTimeSamples,
    differenceEquation: buildDifferenceEquation(b, a),
  };
}

function applyFirCausal(input: Float32Array, b: number[]): Float32Array {
  const n = input.length;
  const m = b.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    const limit = Math.min(i + 1, m);
    for (let k = 0; k < limit; k++) {
      acc += b[k] * input[i - k];
    }
    out[i] = acc;
  }
  return out;
}

function applyBiquadsCausal(input: Float32Array, sections: BiquadSection[]): Float32Array {
  let buf = new Float64Array(input.length);
  for (let i = 0; i < input.length; i++) buf[i] = input[i];

  for (const s of sections) {
    const next = new Float64Array(buf.length);
    let z1 = 0;
    let z2 = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i];
      const y = s.b0 * x + z1;
      z1 = s.b1 * x - s.a1 * y + z2;
      z2 = s.b2 * x - s.a2 * y;
      next[i] = y;
    }
    buf = next;
  }

  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const val = buf[i];
    out[i] = Number.isFinite(val) ? Math.max(-1.0, Math.min(1.0, val)) : 0;
  }
  return out;
}

function reverseFloat32(arr: Float32Array): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = arr[arr.length - 1 - i];
  }
  return out;
}

/**
 * Applies the configured FIR or IIR filter to a Float32Array audio channel.
 */
export function filterAudioChannel(input: Float32Array, config: FilterConfig): Float32Array {
  if (config.architecture === 'FIR') {
    const b = designFirKernel(
      config.type,
      config.cutoffHz,
      config.cutoffHighHz,
      config.order,
      config.sampleRate,
      config.windowType
    );
    if (config.zeroPhase) {
      // Shift by group delay (M/2) for zero-phase alignment on FIR
      const half = Math.floor((b.length - 1) / 2);
      const raw = applyFirCausal(input, b);
      const aligned = new Float32Array(input.length);
      for (let i = 0; i < input.length; i++) {
        aligned[i] = i + half < raw.length ? raw[i + half] : 0;
      }
      return aligned;
    }
    return applyFirCausal(input, b);
  }

  const iir = designButterworthIir(
    config.type,
    config.cutoffHz,
    config.cutoffHighHz,
    config.order,
    config.sampleRate
  );
  if (config.zeroPhase) {
    const forward = applyBiquadsCausal(input, iir.biquads);
    const reversed = reverseFloat32(forward);
    const backward = applyBiquadsCausal(reversed, iir.biquads);
    return reverseFloat32(backward);
  }
  return applyBiquadsCausal(input, iir.biquads);
}
