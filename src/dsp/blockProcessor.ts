import { encodeWavBlob } from './audioUtils';
import { filterAudioChannel } from './filters';
import { computeReferenceMetrics } from './metrics';
import { DataScenario, estimateSnrFromNoiseSegment } from './scenarios';
import {
  spectralSubtractChannel,
  SpectralSubtractionConfig,
} from './spectralSubtraction';
import { AudioSignalData, FilterConfig } from '../types/sonora';

export type MethodId = 'fir' | 'iir' | 'spectral';

export interface MethodComparisonResult {
  methodId: MethodId;
  methodLabel: string;
  lineDash: 'solid' | 'dash' | 'dot';
  outputAudio: AudioSignalData;
  inputSnrDb: number | null;
  outputSnrDb: number | null;
  snrImprovementDb: number | null;
  snrIsEstimate: boolean;
  mse: number | null;
  rmse: number | null;
  blockLatencyMs: number;
  computePerBlockMs: number;
  realtimeStatus: 'OFFLINE' | 'REAL-TIME' | 'TIDAK REAL-TIME';
}

export interface ComparisonSuiteInput {
  noisyAudio: AudioSignalData;
  referenceAudio: AudioSignalData | null;
  scenario: DataScenario;
  noiseSegmentSec: number;
  isLiveMicSource: boolean;
  blockSize: number;
  firConfig: FilterConfig;
  iirConfig: FilterConfig;
  spectralConfig: SpectralSubtractionConfig;
}

function measureBlockCompute(
  totalSamples: number,
  blockSize: number,
  blockFn: (chunk: Float32Array) => Float32Array,
  inputSamples: Float32Array
): number {
  const numBlocks = Math.max(1, Math.ceil(totalSamples / blockSize));
  const sampleBlocks = Math.min(numBlocks, 24);
  const stride = Math.max(1, Math.floor(numBlocks / sampleBlocks));

  const t0 = performance.now();
  let executed = 0;
  for (let b = 0; b < numBlocks; b += stride) {
    const start = b * blockSize;
    const end = Math.min(totalSamples, start + blockSize);
    const slice = inputSamples.subarray(start, end);
    blockFn(slice);
    executed++;
  }
  const elapsed = performance.now() - t0;
  return elapsed / Math.max(1, executed);
}

export function runThreeMethodComparison(
  params: ComparisonSuiteInput
): MethodComparisonResult[] {
  const {
    noisyAudio,
    referenceAudio,
    scenario,
    noiseSegmentSec,
    isLiveMicSource,
    blockSize,
    firConfig,
    iirConfig,
    spectralConfig,
  } = params;

  const fs = noisyAudio.sampleRate;
  const blockLatencyMs = (blockSize / fs) * 1000;
  const baseName = noisyAudio.name.replace(/\.[^.]+$/, '');

  const firCfg: FilterConfig = { ...firConfig, architecture: 'FIR', sampleRate: fs };
  const iirCfg: FilterConfig = { ...iirConfig, architecture: 'IIR', sampleRate: fs };
  const specCfg: SpectralSubtractionConfig = { ...spectralConfig, noiseSegmentSec };

  const specs: Array<{
    id: MethodId;
    label: string;
    lineDash: 'solid' | 'dash' | 'dot';
    processFull: (ch: Float32Array) => Float32Array;
    processBlock: (chunk: Float32Array) => Float32Array;
  }> = [
    {
      id: 'fir',
      label: `Filter FIR (${firCfg.type}, Orde ${firCfg.order})`,
      lineDash: 'solid',
      processFull: (ch) => filterAudioChannel(ch, firCfg),
      processBlock: (chunk) => filterAudioChannel(chunk, firCfg),
    },
    {
      id: 'iir',
      label: `Filter IIR Butterworth (${iirCfg.type}, Orde ${iirCfg.order})`,
      lineDash: 'dash',
      processFull: (ch) => filterAudioChannel(ch, iirCfg),
      processBlock: (chunk) => filterAudioChannel(chunk, iirCfg),
    },
    {
      id: 'spectral',
      label: `Spectral Subtraction (N=${specCfg.frameSize}, α=${specCfg.subtractionFactor.toFixed(1)})`,
      lineDash: 'dot',
      processFull: (ch) => spectralSubtractChannel(ch, fs, specCfg),
      processBlock: (chunk) => spectralSubtractChannel(chunk, fs, specCfg),
    },
  ];

  return specs.map((spec) => {
    const computePerBlockMs = measureBlockCompute(
      noisyAudio.samples.length,
      blockSize,
      spec.processBlock,
      noisyAudio.samples
    );

    const processedChannels = noisyAudio.channelBuffers.map((ch) => spec.processFull(ch));
    const monoOut =
      processedChannels.length === 1
        ? processedChannels[0]
        : (() => {
            const len = processedChannels[0].length;
            const mix = new Float32Array(len);
            for (let i = 0; i < len; i++) {
              let sum = 0;
              for (let c = 0; c < processedChannels.length; c++) sum += processedChannels[c][i];
              mix[i] = sum / processedChannels.length;
            }
            return mix;
          })();

    const wavBlob = encodeWavBlob(processedChannels, fs);
    const outAudio: AudioSignalData = {
      id: `out-${spec.id}-${Date.now()}`,
      name: `${baseName}_${spec.id}.wav`,
      format: 'WAV',
      fileSizeBytes: wavBlob.size,
      durationSec: noisyAudio.durationSec,
      sampleRate: fs,
      channels: noisyAudio.channels,
      samples: monoOut,
      channelBuffers: processedChannels,
      blobUrl: URL.createObjectURL(wavBlob),
      isDemoData: noisyAudio.isDemoData,
      loadedAt: new Date().toISOString(),
    };

    let inputSnrDb: number | null = null;
    let outputSnrDb: number | null = null;
    let snrImprovementDb: number | null = null;
    let snrIsEstimate = false;
    let mse: number | null = null;
    let rmse: number | null = null;

    if (scenario !== 'B' && referenceAudio) {
      const refMetrics = computeReferenceMetrics(
        noisyAudio.samples,
        monoOut,
        referenceAudio.samples
      );
      inputSnrDb = refMetrics.inputSnrDb;
      outputSnrDb = refMetrics.outputSnrDb;
      snrImprovementDb = refMetrics.snrImprovementDb;
      mse = refMetrics.mse;
      rmse = refMetrics.rmse;
      snrIsEstimate = false;
    } else if (scenario === 'B') {
      const est = estimateSnrFromNoiseSegment(
        noisyAudio.samples,
        monoOut,
        fs,
        noiseSegmentSec
      );
      inputSnrDb = est.inputSnrEstDb;
      outputSnrDb = est.outputSnrEstDb;
      snrImprovementDb = est.snrGainDb;
      snrIsEstimate = true;
      mse = null;
      rmse = null;
    }

    const realtimeStatus: MethodComparisonResult['realtimeStatus'] = !isLiveMicSource
      ? 'OFFLINE'
      : computePerBlockMs < blockLatencyMs
        ? 'REAL-TIME'
        : 'TIDAK REAL-TIME';

    return {
      methodId: spec.id,
      methodLabel: spec.label,
      lineDash: spec.lineDash,
      outputAudio: outAudio,
      inputSnrDb,
      outputSnrDb,
      snrImprovementDb,
      snrIsEstimate,
      mse,
      rmse,
      blockLatencyMs,
      computePerBlockMs,
      realtimeStatus,
    };
  });
}
