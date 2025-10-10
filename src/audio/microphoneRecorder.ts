const WAVEFORM_RESOLUTION = 1024;
const ANALYSER_FFT_SIZE = 2048;
const TARGET_WAVEFORM_PEAK = 0.5;
const GAIN_SMOOTHING = 0.003;
const SILENCE_THRESHOLD = 0.02;
const AUTO_GAIN_MIN = 1;
const AUTO_GAIN_MAX = 4;
const MANUAL_GAIN_MIN = 0.5;
const MANUAL_GAIN_MAX = 6;
const SILENCE_RELEASE_FACTOR = 0.95;
const PEAK_THRESHOLD = 0.1;
const MIN_PEAK_INTERVAL = 0.05;
const ATTACK_SLOPE_MIN = 0.015;

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
  lastIndex: number;
  gain: number;
}

export interface Pitch {
  frequency: number;
  confidence: number;
}


export class MicrophoneRecorder {
  private readonly supported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function';

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private context: AudioContext | null = null;
  private capturing = false;

  private readonly analyserBuffer = new Float32Array(ANALYSER_FFT_SIZE / 2);
  private readonly minPeaks = new Float32Array(WAVEFORM_RESOLUTION);
  private readonly maxPeaks = new Float32Array(WAVEFORM_RESOLUTION);
  private readonly filled = new Uint8Array(WAVEFORM_RESOLUTION);
  private lastIndex = -1;
  private autoGainEnabled = true;
  private gain = AUTO_GAIN_MIN;
  private manualGain = 1;
  private lastGainUpdate = 0;
  private lastSampleTime = 0;
  private detectedPeaks: Array<{ time: number; amplitude: number }> = [];
  private lastDetectedPeakTime = 0;
  private pitch: Pitch | null = null;

  async start(context: AudioContext): Promise<void> {
    if (!this.supported) {
      this.capturing = false;
      this.reset();
      return;
    }

    if (!this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (error) {
        console.error('Unable to access microphone input', error);
        this.stream = null;
        return;
      }
    }

    if (!this.stream) {
      return;
    }

    if (this.context !== context) {
      this.disconnectNodes();
      this.context = context;
      this.source = context.createMediaStreamSource(this.stream);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = ANALYSER_FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.2;
      this.source.connect(this.analyser);
    }

    this.gain = this.autoGainEnabled ? AUTO_GAIN_MIN : this.manualGain;
    this.lastSampleTime = context.currentTime;
    this.lastGainUpdate = this.lastSampleTime;
    this.capturing = Boolean(this.analyser);
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  /**
   * Captures and processes raw audio from the microphone.
   * This should be called on every animation frame when audio processing is needed.
   */
  processAudio(now: number): void {
    if (!this.capturing || !this.analyser) {
      return;
    }
    this.analyser.getFloatTimeDomainData(this.analyserBuffer);
    this.lastSampleTime = now;
    this.updatePitch();
  }

  captureSample(
    now: number,
    playbackStart: number,
    playbackDuration: number,
    latencySec = 0,
  ) {
    this.processAudio(now);

    const adjustedNow = now - latencySec;
    const progress = (adjustedNow - playbackStart) / playbackDuration;
    if (progress < 0 || progress > 1) {
      return;
    }

    let min = 1;
    let max = -1;
    for (const sample of this.analyserBuffer) {
      if (sample < min) {
        min = sample;
      }
      if (sample > max) {
        max = sample;
      }
    }

    const index = Math.min(
      WAVEFORM_RESOLUTION - 1,
      Math.max(0, Math.round(progress * (WAVEFORM_RESOLUTION - 1))),
    );

    const peak = Math.max(Math.abs(min), Math.abs(max));
    let desiredGain: number;
    if (this.autoGainEnabled) {
      desiredGain =
        peak >= SILENCE_THRESHOLD
          ? Math.min(
              AUTO_GAIN_MAX,
              Math.max(AUTO_GAIN_MIN, TARGET_WAVEFORM_PEAK / peak),
            )
          : Math.max(AUTO_GAIN_MIN, this.gain * SILENCE_RELEASE_FACTOR);
    } else {
      desiredGain = this.manualGain;
    }

    this.gain += (desiredGain - this.gain) * GAIN_SMOOTHING;

    const scaledMin = Math.max(-1, Math.min(1, min * this.gain));
    const scaledMax = Math.max(-1, Math.min(1, max * this.gain));

    const sampleRate = this.context?.sampleRate ?? 44100;
    const bufferLength = this.analyserBuffer.length;
    const bufferDuration = bufferLength / sampleRate;
    const bufferStartTime = now - bufferDuration;

    let peakAmplitude = 0;
    let peakIndex = -1;

    let attackIndex = -1;
    for (let i = 1; i < bufferLength; i += 1) {
      const sample = this.analyserBuffer[i];
      const amplitude = Math.abs(sample);
      if (amplitude >= PEAK_THRESHOLD) {
        const prevAmplitude = Math.abs(this.analyserBuffer[i - 1]);
        if (amplitude - prevAmplitude >= ATTACK_SLOPE_MIN) {
          attackIndex = i;
          peakAmplitude = amplitude;
          break;
        }
      }
    }

    if (attackIndex >= 0) {
      peakIndex = attackIndex;
    } else {
      for (let i = 1; i < bufferLength - 1; i += 1) {
        const sample = this.analyserBuffer[i];
        const amplitude = Math.abs(sample);
        if (amplitude > peakAmplitude && amplitude > PEAK_THRESHOLD) {
          const prev = Math.abs(this.analyserBuffer[i - 1]);
          const next = Math.abs(this.analyserBuffer[i + 1]);
          if (amplitude >= prev && amplitude >= next) {
            peakAmplitude = amplitude;
            peakIndex = i;
          }
        }
      }
    }

    if (peakIndex >= 0) {
      const peakTime = adjustedNow - bufferDuration + (peakIndex / bufferLength) * bufferDuration;
      if (peakTime - this.lastDetectedPeakTime >= MIN_PEAK_INTERVAL) {
        this.lastDetectedPeakTime = peakTime;
        this.detectedPeaks.push({ time: peakTime, amplitude: peakAmplitude });
      }
    }

    if (this.filled[index]) {
      this.minPeaks[index] = Math.min(this.minPeaks[index], scaledMin);
      this.maxPeaks[index] = Math.max(this.maxPeaks[index], scaledMax);
    } else {
      this.minPeaks[index] = scaledMin;
      this.maxPeaks[index] = scaledMax;
      this.filled[index] = 1;
    }

    if (index > this.lastIndex) {
      this.lastIndex = index;
    }
  }

  private updatePitch(): void {
    if (!this.analyser) {
      this.pitch = null;
      return;
    }

    const buffer = this.analyserBuffer;
    const bufferSize = buffer.length;
    const sampleRate = this.context?.sampleRate ?? 44100;

    // 1. Calculate Root Mean Square (RMS) to check for silence
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / bufferSize);

    if (rms < 0.01) { // Not enough signal
      this.pitch = null;
      return;
    }

    // 2. Autocorrelation
    const correlations = new Float32Array(bufferSize).fill(0);
    for (let lag = 0; lag < bufferSize; lag++) {
      for (let i = 0; i < bufferSize - lag; i++) {
        correlations[lag] += buffer[i] * buffer[i + lag];
      }
    }

    // 3. Find the peak in the correlations
    let bestLag = -1;
    let bestCorrelation = 0;
    // Start search from a lag that corresponds to a reasonable minimum frequency
    const minSamples = Math.floor(sampleRate / 2000); // Max freq: 2kHz
    for (let lag = minSamples; lag < bufferSize; lag++) {
      // Simple peak detection
      if (correlations[lag] > bestCorrelation) {
        bestCorrelation = correlations[lag];
        bestLag = lag;
      }
    }

    // 4. Calculate confidence and frequency
    if (bestLag !== -1) {
      // A good correlation is > 0.9 of the initial energy (lag 0)
      const confidence = correlations[bestLag] / correlations[0];
      if (confidence > 0.9) {
        this.pitch = {
          frequency: sampleRate / bestLag,
          confidence,
        };
        return;
      }
    }

    this.pitch = null;
  }

  reset(): void {
    this.clearPeaks();
    this.gain = this.autoGainEnabled ? AUTO_GAIN_MIN : this.manualGain;
    this.lastSampleTime = 0;
    this.lastGainUpdate = 0;
  }

  clearPeaks(): void {
    this.minPeaks.fill(0);
    this.maxPeaks.fill(0);
    this.filled.fill(0);
    this.lastIndex = -1;
    this.detectedPeaks = [];
    this.lastDetectedPeakTime = 0;
    this.pitch = null;
  }

  async stop(): Promise<void> {
    this.capturing = false;
    this.reset();

    this.disconnectNodes();
    this.context = null;

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  getPeaks(): WaveformPeaks {
    return {
      min: this.minPeaks,
      max: this.maxPeaks,
      lastIndex: this.lastIndex,
      gain: this.gain,
    };
  }

  getPitch(): Pitch | null {
    return this.pitch;
  }

  setAutoGain(enabled: boolean): void {
    this.autoGainEnabled = enabled;
    if (this.autoGainEnabled) {
      this.lastGainUpdate = this.lastSampleTime;
    } else {
      this.gain = this.manualGain;
      this.lastGainUpdate = this.lastSampleTime;
    }
  }

  isAutoGainEnabled(): boolean {
    return this.autoGainEnabled;
  }

  setManualGain(gain: number): void {
    this.manualGain = Math.min(
      MANUAL_GAIN_MAX,
      Math.max(MANUAL_GAIN_MIN, gain),
    );
    if (!this.autoGainEnabled) {
      this.gain = this.manualGain;
      this.lastGainUpdate = this.lastSampleTime;
    }
  }

  getManualGain(): number {
    return this.manualGain;
  }

  getManualGainRange(): { min: number; max: number } {
    return { min: MANUAL_GAIN_MIN, max: MANUAL_GAIN_MAX };
  }

  consumePeaks(): Array<{ time: number; amplitude: number }> {
    if (this.detectedPeaks.length === 0) {
      return [];
    }
    const peaks = this.detectedPeaks;
    this.detectedPeaks = [];
    return peaks;
  }

  private disconnectNodes(): void {
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // no-op
      }
      this.source = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // no-op
      }
      this.analyser = null;
    }
  }
}
