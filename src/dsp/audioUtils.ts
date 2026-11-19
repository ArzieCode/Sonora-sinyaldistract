import { AudioSignalData } from '../types/sonora';

const ALLOWED_EXTENSIONS = ['.wav', '.mp3', '.flac'];

export function validateAudioFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasValidExt) {
    return `Unsupported file format "${file.name}". Please upload WAV, MP3, or FLAC audio files.`;
  }
  if (file.size === 0) {
    return `File "${file.name}" is empty (0 bytes).`;
  }
  if (file.size > 100 * 1024 * 1024) {
    return `File "${file.name}" exceeds the 100 MB browser decoding limit.`;
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.00 s';
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toFixed(1)}s`;
}

function mixToMono(channelBuffers: Float32Array[]): Float32Array {
  if (channelBuffers.length === 1) return channelBuffers[0];
  const len = channelBuffers[0].length;
  const mono = new Float32Array(len);
  const count = channelBuffers.length;
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let c = 0; c < count; c++) {
      sum += channelBuffers[c][i];
    }
    mono[i] = sum / count;
  }
  return mono;
}

export async function decodeAudioFile(file: File): Promise<AudioSignalData> {
  const validationError = validateAudioFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const channelBuffers: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      channelBuffers.push(new Float32Array(decoded.getChannelData(c)));
    }
    const samples = mixToMono(channelBuffers);
    const ext = file.name.split('.').pop()?.toUpperCase() || 'AUDIO';
    const blobUrl = URL.createObjectURL(file);

    return {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      format: ext,
      fileSizeBytes: file.size,
      durationSec: decoded.duration,
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      samples,
      channelBuffers,
      blobUrl,
      isDemoData: false,
      loadedAt: new Date().toISOString(),
    };
  } catch {
    throw new Error(
      `Failed to decode "${file.name}". Ensure the file is a valid, uncorrupted WAV, MP3, or FLAC recording.`
    );
  } finally {
    await audioCtx.close().catch(() => undefined);
  }
}

/**
 * Encodes multi-channel Float32Array PCM buffers into a standard 16-bit PCM WAV Blob.
 */
export function encodeWavBlob(channelBuffers: Float32Array[], sampleRate: number): Blob {
  const numChannels = channelBuffers.length;
  const numFrames = channelBuffers[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelBuffers[c][i] || 0));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// Deterministic PRNG for reproducible synthetic test signals
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

export interface DemoAudioPair {
  noisy: AudioSignalData;
  cleanReference: AudioSignalData;
  recommendedCutoffHz: number;
  recommendedFilterType: 'lowpass' | 'highpass' | 'bandpass' | 'bandstop';
}

/**
 * Generates real deterministic synthetic WAV audio signals for laboratory demonstration.
 */
export function generateDemoAudioPair(
  preset: 'speech-hiss' | 'mains-hum' = 'speech-hiss'
): DemoAudioPair {
  const sampleRate = 16000;
  const durationSec = 3.0;
  const n = Math.floor(sampleRate * durationSec);

  const clean = new Float32Array(n);
  const noisy = new Float32Array(n);
  const rand = mulberry32(preset === 'speech-hiss' ? 4219 : 8841);

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Syllable-like amplitude envelope (3 modulated bursts across 3 seconds)
    const env =
      0.55 * Math.exp(-Math.pow((t - 0.65) / 0.28, 2)) +
      0.7 * Math.exp(-Math.pow((t - 1.5) / 0.32, 2)) +
      0.6 * Math.exp(-Math.pow((t - 2.35) / 0.25, 2)) +
      0.08;

    // Harmonic target signal in speech-fundamental & formant band (220 Hz, 440 Hz, 660 Hz)
    const target =
      env *
      (0.55 * Math.sin(2 * Math.PI * 220 * t) +
        0.3 * Math.sin(2 * Math.PI * 440 * t) +
        0.15 * Math.sin(2 * Math.PI * 660 * t));

    clean[i] = target;

    if (preset === 'speech-hiss') {
      // High-frequency tonal whistle (3800 Hz + 5200 Hz) + broadband white noise
      const hfWhistle =
        0.24 * Math.sin(2 * Math.PI * 3800 * t) +
        0.16 * Math.sin(2 * Math.PI * 5200 * t);
      const white = (rand() * 2 - 1) * 0.08;
      noisy[i] = Math.max(-0.98, Math.min(0.98, target + hfWhistle + white));
    } else {
      // 60 Hz mains hum + 180 Hz harmonic interference
      const hum =
        0.35 * Math.sin(2 * Math.PI * 60 * t) +
        0.12 * Math.sin(2 * Math.PI * 180 * t);
      const white = (rand() * 2 - 1) * 0.03;
      noisy[i] = Math.max(-0.98, Math.min(0.98, target + hum + white));
    }
  }

  const cleanBlob = encodeWavBlob([clean], sampleRate);
  const noisyBlob = encodeWavBlob([noisy], sampleRate);

  const label = preset === 'speech-hiss' ? 'demo_harmonic_hf_noise' : 'demo_harmonic_60hz_hum';

  return {
    noisy: {
      id: `demo-noisy-${preset}`,
      name: `${label}_noisy.wav`,
      format: 'WAV',
      fileSizeBytes: noisyBlob.size,
      durationSec,
      sampleRate,
      channels: 1,
      samples: noisy,
      channelBuffers: [noisy],
      blobUrl: URL.createObjectURL(noisyBlob),
      isDemoData: true,
      loadedAt: new Date().toISOString(),
    },
    cleanReference: {
      id: `demo-clean-${preset}`,
      name: `${label}_clean_ref.wav`,
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
    recommendedCutoffHz: preset === 'speech-hiss' ? 1200 : 120,
    recommendedFilterType: preset === 'speech-hiss' ? 'lowpass' : 'highpass',
  };
}
