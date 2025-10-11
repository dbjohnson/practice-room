const WAVEFORM_RESOLUTION = 1024;
const ANALYSER_FFT_SIZE = 4096;
const TARGET_WAVEFORM_PEAK = 0.5;
const GAIN_SMOOTHING = 0.003;
const SILENCE_THRESHOLD = 0.02;
const AUTO_GAIN_MIN = 1;
const AUTO_GAIN_MAX = 4;
const MANUAL_GAIN_MIN = 0.5;
const MANUAL_GAIN_MAX = 6;
const SILENCE_RELEASE_FACTOR = 0.95;
const PEAK_THRESHOLD = 0.03;
const MIN_PEAK_INTERVAL = 0.04;
const ATTACK_SLOPE_MIN = 0.008;
const MIN_TUNER_FREQUENCY = 40;
const MAX_TUNER_FREQUENCY = 2000;
const MIN_TUNER_CONFIDENCE = 0.6;
const PITCH_SILENCE_RMS = 0.001;
const YIN_THRESHOLD = 0.2;
const PITCH_HISTORY_SIZE = 7;
const PITCH_SMOOTHING_ALPHA = 0.18;
const PITCH_SMOOTHING_FAST_ALPHA = 0.45;
const PITCH_SMOOTHING_FAST_THRESHOLD = 8;
const PITCH_HOLD_FRAMES = 4;
const PITCH_HOLD_DECAY = 0.12;

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

  private readonly analyserBuffer = new Float32Array(ANALYSER_FFT_SIZE);
  private readonly pitchBuffer = new Float32Array(ANALYSER_FFT_SIZE);
  private readonly differenceBuffer = new Float32Array(ANALYSER_FFT_SIZE / 2);
  private readonly differenceRawBuffer = new Float32Array(ANALYSER_FFT_SIZE / 2);
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
  private readonly pitchHistory: number[] = [];
  private smoothedFrequency: number | null = null;
  private pitch: Pitch | null = null;
  private consecutiveInvalidPitchFrames = 0;

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

  captureSample(
    now: number,
    playbackStart: number,
    playbackDuration: number,
    latencySec = 0,
  ) {
    if (!this.capturing || !this.analyser || playbackDuration <= 0) {
      return;
    }

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

  processAudio(now: number): void {
    if (!this.capturing || !this.analyser) {
      return;
    }
    this.analyser.getFloatTimeDomainData(this.analyserBuffer);
    this.lastSampleTime = now;

    // This is where peak detection and pitch analysis should happen
    // for both playback and standalone tuner.
    this.updatePitch();
  }

  private updatePitch(): void {
    const context = this.context;
    if (!this.analyser || !context) {
      this.handleInvalidPitchFrame();
      return;
    }

    const sampleRate = context.sampleRate;
    const buffer = this.analyserBuffer;
    const working = this.pitchBuffer;
    const bufferSize = buffer.length;
    const difference = this.differenceBuffer;
    const differenceRaw = this.differenceRawBuffer;
    const minLag = Math.max(1, Math.floor(sampleRate / MAX_TUNER_FREQUENCY));
    const maxLag = Math.min(
      Math.floor(sampleRate / MIN_TUNER_FREQUENCY),
      working.length / 2 - 2,
    );

    if (maxLag <= minLag) {
      this.handleInvalidPitchFrame();
      return;
    }

    // Copy buffer, remove DC, compute RMS to gate low-energy frames.
    let sum = 0;
    for (let i = 0; i < bufferSize; i += 1) {
      const sample = buffer[i];
      working[i] = sample;
      sum += sample;
    }

    const mean = sum / bufferSize;
    let rms = 0;
    for (let i = 0; i < bufferSize; i += 1) {
      const centered = working[i] - mean;
      working[i] = centered;
      rms += centered * centered;
    }
    rms = Math.sqrt(rms / bufferSize);

    if (!Number.isFinite(rms) || rms < PITCH_SILENCE_RMS) {
      this.handleInvalidPitchFrame();
      return;
    }

    difference.fill(0, 0, maxLag + 1);
    differenceRaw.fill(0, 0, maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag += 1) {
      let sumSquares = 0;
      for (let i = 0; i < bufferSize - lag; i += 1) {
        const delta = working[i] - working[i + lag];
        sumSquares += delta * delta;
      }
      differenceRaw[lag] = sumSquares;
      difference[lag] = sumSquares;
    }

    let runningSum = 0;
    for (let lag = 1; lag <= maxLag; lag += 1) {
      runningSum += difference[lag];
      difference[lag] =
        runningSum === 0 ? 1 : (difference[lag] * lag) / runningSum;
    }

    let tau = -1;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (difference[lag] < YIN_THRESHOLD) {
        tau = lag;
        while (tau + 1 <= maxLag && difference[tau + 1] < difference[tau]) {
          tau += 1;
        }
        break;
      }
    }

    if (tau === -1) {
      let bestValue = Number.POSITIVE_INFINITY;
      for (let lag = minLag; lag <= maxLag; lag += 1) {
        const value = difference[lag];
        if (value < bestValue) {
          bestValue = value;
          tau = lag;
        }
      }
    }

    if (tau <= 0 || tau >= bufferSize) {
      this.handleInvalidPitchFrame();
      return;
    }

    let refinedTau = tau;
    if (tau > 1 && tau < maxLag) {
      const s0 = differenceRaw[tau - 1];
      const s1 = differenceRaw[tau];
      const s2 = differenceRaw[tau + 1];
      const denominator = s0 - 2 * s1 + s2;
      if (denominator !== 0) {
        refinedTau = tau + 0.5 * (s0 - s2) / denominator;
      }
    }

    const frequency = sampleRate / refinedTau;
    if (!Number.isFinite(frequency)) {
      this.handleInvalidPitchFrame();
      return;
    }

    const confidence = Math.max(0, Math.min(1, 1 - difference[tau]));
    if (
      confidence < MIN_TUNER_CONFIDENCE ||
      frequency < MIN_TUNER_FREQUENCY ||
      frequency > MAX_TUNER_FREQUENCY
    ) {
      this.handleInvalidPitchFrame();
      return;
    }

    this.pitchHistory.push(frequency);
    if (this.pitchHistory.length > PITCH_HISTORY_SIZE) {
      this.pitchHistory.shift();
    }

    const sorted = [...this.pitchHistory].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const baseFrequency = this.smoothedFrequency ?? median;
    const delta = median - baseFrequency;
    const alpha =
      Math.abs(delta) > PITCH_SMOOTHING_FAST_THRESHOLD
        ? PITCH_SMOOTHING_FAST_ALPHA
        : PITCH_SMOOTHING_ALPHA;

    this.smoothedFrequency = baseFrequency + alpha * delta;

    this.pitch = {
      frequency: this.smoothedFrequency ?? frequency,
      confidence,
    };
    this.consecutiveInvalidPitchFrames = 0;
  }

  private handleInvalidPitchFrame(): void {
    this.consecutiveInvalidPitchFrames += 1;
    if (!this.pitch) {
      if (this.consecutiveInvalidPitchFrames > PITCH_HOLD_FRAMES) {
        this.resetPitchState();
      }
      return;
    }

    if (this.consecutiveInvalidPitchFrames > PITCH_HOLD_FRAMES) {
      this.resetPitchState();
      return;
    }

    const reducedConfidence = Math.max(
      0,
      this.pitch.confidence - PITCH_HOLD_DECAY,
    );

    this.pitch = {
      frequency: this.pitch.frequency,
      confidence: reducedConfidence,
    };
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
    this.resetPitchState();
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

  private resetPitchState(): void {
    this.pitchHistory.length = 0;
    this.smoothedFrequency = null;
    this.pitch = null;
    this.consecutiveInvalidPitchFrames = 0;
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
