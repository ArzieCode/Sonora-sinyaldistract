# SONORA — Signal Observation, Noise Optimization & Response Analysis

**SONORA** is an academic Digital Signal Processing (DSP) laboratory workbench designed for university students, lecturers, and researchers to inspect acoustic and electrophysiological signals, configure digital filtering pipelines, compare noise-reduction methods, and evaluate quantitative metrics directly in the browser.

---

## Key Modules & Capabilities

### 1. Audio Noise Reduction Workbench
- **Audio Input & Capture**:
  - Live microphone recording via the Web Audio API with real-time input level metering (`dBFS`), live time-domain trace, and live FFT spectrum preview.
  - Upload `.wav` / browser-supported audio files with automatic inspection of sampling rate, duration, channel count, and total sample count.
- **Experimental Scenarios**:
  - **Scenario A (Synthetic Noise + Clean Reference)**: Adds white noise or 50 Hz mains hum at configurable initial SNR (`0 / 5 / 10 / 15 dB`) to a clean signal so reference-based SNR, MSE, and RMSE are exact.
  - **Scenario B (Real Noisy Signal)**: Estimates noise floor and output SNR from a configurable initial noise-only segment (default `2.0 s`), without claiming ground-truth MSE/RMSE.
  - **Scenario C (Aligned Two-Recording Reference)**: Compares a noisy recording against an uploaded reference file with sample-offset alignment (`MSE / RMSE` labeled as comparative indicators).
- **Three-Method Block Comparison**:
  - Runs **FIR Windowed-Sinc** (Hamming / Hann / Blackman), **IIR Butterworth** (Low-pass, High-pass, Band-pass, Band-stop), and **Spectral Subtraction** (STFT overlap-add with noise-profile estimation) over identical audio blocks.
  - Computes per-block execution time, block latency, real-time feasibility status, SNR / ΔSNR, MSE, and RMSE.
- **Signal & Filter Inspection**:
  - Interactive Plotly visualizations for time-domain waveforms (noisy, denoised, reference), linear/log FFT magnitude spectra, and STFT spectrograms.
  - **Filter Laboratory**: Magnitude response (`dB`), phase response (`deg`), impulse response `h[n]`, Z-plane pole-zero plot with stability check, filter coefficients (`b_k`, `a_k`), and difference equation.
- **Playback & Exports**:
  - Synchronized audio playback bar across noisy, denoised, and reference tracks.
  - Export denoised audio (`.wav`), comparison metrics (`.csv`, `.json`), and formatted laboratory reports (`.pdf`).

### 2. Offline EEG Signal Analysis
- **Offline Dataset Management**:
  - Parses standard 16-bit binary **EDF/EDF+** (`.edf`), **CSV** (`.csv`, `.txt`), and **JSON** (`.json`) EEG datasets into microvolt (`µV`) channel buffers.
  - Includes a deterministic synthetic calibration test vector (`calibration_test_6ch_256hz.csv`) strictly for filter verification (clearly labeled as non-physiological).
  - Displays dataset metadata (filename, source, sampling rate, channels, duration, and Raw / Noisy / Preprocessed status) with multi-channel selection, focus-channel selection, and time-window slicing.
- **Offline Digital Filtering**:
  - Independent per-channel filtering using **FIR (Windowed-Sinc)** or **IIR Butterworth** (`bandpass`, `highpass`, `lowpass`, `bandstop` notch), configurable order, cutoff frequencies, and zero-phase bidirectional filtering.
  - Raw EEG channels are preserved for before-and-after evaluation; audio-specific spectral subtraction is intentionally excluded from EEG processing.
- **EEG Visualizations & Band Analysis**:
  - Multichannel vertical-offset waveform (`µV`).
  - Focus-channel Before-and-After comparison (`Overlay` and `Side-by-Side` modes).
  - **Welch PSD (`µV²/Hz`)** comparing raw and filtered spectra with Delta (`0.5–4 Hz`), Theta (`4–8 Hz`), Alpha (`8–13 Hz`), Beta (`13–30 Hz`), and Gamma (`30–45 Hz`) band markers.
  - **EEG Spectrogram (STFT)** (`0–60 Hz` or up to Nyquist).
  - **Frequency Band Analysis**: Integrates absolute (`µV²`) and relative (`%`) band power only for bands supported below the Nyquist frequency (`fs / 2`).
- **Scientific Disclosures**:
  - Explicitly notes that total signal power reduction does not equate to improved physiological signal quality, and reports `MSE / RMSE / SNR` as `Not Available` unless a valid artifact-free reference exists.

### 3. Cross-Domain DSP Comparison
- Side-by-side summary of **Audio Processing Results** and **Offline EEG Processing Results**.
- Compares FIR vs. IIR computation times, spectral bandwidths, and phase-design trade-offs while preserving strict methodological separation between acoustic SNR (`dB`) and electrophysiological EEG band power (`µV² / %`).

---

## Project Structure

```text
src/
├── App.tsx                                # Main workbench layout, navigation routing, and state management
├── index.css                              # Design tokens (warm paper palette, typography, base styling)
├── main.tsx                               # React entry point
├── types/
│   └── sonora.ts                          # Shared TypeScript interfaces and navigation types
├── dsp/
│   ├── audioUtils.ts                      # Audio decoding, WAV encoding, and signal formatting utilities
│   ├── blockProcessor.ts                  # Block-level comparison runner for FIR, IIR, and Spectral Subtraction
│   ├── eegOffline.ts                      # Binary EDF/EDF+, CSV, and JSON EEG parsers + offline filtering & Welch PSD metrics
│   ├── fft.ts                             # Radix-2 Cooley-Tukey FFT, windows, magnitude spectrum, STFT, and Welch PSD
│   ├── filters.ts                         # Windowed-Sinc FIR & Bilinear Butterworth IIR filter design and application
│   ├── metrics.ts                         # Signal statistics, SNR, MSE, RMSE, and waveform downsampling
│   ├── scenarios.ts                       # Scenario A/B/C signal construction and noise-segment SNR estimation
│   └── spectralSubtraction.ts             # STFT overlap-add spectral subtraction denoiser
├── components/
│   ├── AudioInputSection.tsx              # Microphone capture, file upload, and scenario selector
│   ├── AudioPlayerBar.tsx                 # Synchronized waveform audio playback controls
│   ├── CrossDomainSection.tsx             # Audio vs. EEG cross-domain comparative view
│   ├── EegAnalysisSection.tsx             # Offline EEG dataset manager, filter controls, and visualizations
│   ├── EvaluationAndOutputSection.tsx     # Quantitative metrics table, playback, and exports
│   ├── ExperimentHistorySection.tsx       # Session comparison run log
│   ├── FilterLabSection.tsx               # Frequency response, pole-zero plot, coefficients, and difference equation
│   ├── MethodConfigPanel.tsx              # FIR, IIR, Spectral Subtraction, and block-size configuration
│   ├── NavigationSidebar.tsx              # Grouped scientific workstation navigation
│   ├── PlotlyChart.tsx                    # Responsive Plotly.js wrapper
│   ├── SettingsSection.tsx                # General display and DSP default preferences
│   └── SignalMonitorSection.tsx           # Time-domain waveform, FFT spectrum, and STFT spectrogram panels
└── utils/
    └── comparisonExporters.ts             # CSV and JSON comparison metric exporters
```

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4
- **Scientific Plotting**: Plotly.js (`plotly.js-dist-min`)
- **Icons & Report Export**: `lucide-react`, `jspdf`
- **DSP Engine**: Pure TypeScript client-side implementation (Radix-2 FFT, Bilinear IIR Butterworth, Windowed-Sinc FIR, STFT Spectral Subtraction, Welch PSD, and binary EDF parser)

---

## Getting Started

### Prerequisites
- **Node.js** (v20+ recommended)
- **npm**

### Installation & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Start the development server on port 3000
npm run dev
```

Open `http://localhost:3000` in your browser.

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server at `http://localhost:3000`. |
| `npm run build` | Builds the production bundle into `dist/`. |
| `npm run preview` | Previews the built production bundle locally. |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`). |
| `npm run clean` | Removes `dist` and `server.js` build artifacts. |

---

## Scientific & Operational Notes

- All DSP computations run **locally in the browser** without requiring an external database or user accounts.
- Microphone capture requires browser `MediaDevices.getUserMedia` permission (over `localhost` or HTTPS).
- EEG processing is **strictly offline** and intended for exploratory academic analysis of imported datasets rather than clinical diagnosis.
