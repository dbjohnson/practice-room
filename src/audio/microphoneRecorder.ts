const WAVEFORM_RESOLUTION = 1024;
const ANALYSER_FFT_SIZE = 2048;

export interface WaveformPeaks {
  min: Float32Array;
  max: Float32Array;
  lastIndex: number;
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

  async start(context: AudioContext): Promise<void> {
    if (!this.supported) {
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

    this.capturing = Boolean(this.analyser);
  }

  captureSample(now: number, playbackStart: number, playbackDuration: number) {
    if (!this.capturing || !this.analyser || playbackDuration <= 0) {
      return;
    }

    const progress = (now - playbackStart) / playbackDuration;
    if (progress < 0 || progress > 1) {
      return;
    }

    this.analyser.getFloatTimeDomainData(this.analyserBuffer);

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

    if (this.filled[index]) {
      this.minPeaks[index] = Math.min(this.minPeaks[index], min);
      this.maxPeaks[index] = Math.max(this.maxPeaks[index], max);
    } else {
      this.minPeaks[index] = min;
      this.maxPeaks[index] = max;
      this.filled[index] = 1;
    }

    if (index > this.lastIndex) {
      this.lastIndex = index;
    }
  }

  reset(): void {
    this.minPeaks.fill(0);
    this.maxPeaks.fill(0);
    this.filled.fill(0);
    this.lastIndex = -1;
  }

  async stop(): Promise<void> {
    this.capturing = false;

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
    };
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
