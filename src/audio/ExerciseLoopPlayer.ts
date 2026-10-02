import clickUrl from './assets/woody-block.wav?url';
import { loopClickBuffer } from './loopClickBuffer';

export interface LoopPosition {
  tick: number;
  origin: number;
  pass: number;
}

/** One native looping source owns all wrap points; JS only observes its clock. */
export class ExerciseLoopPlayer {
  private source: AudioBufferSourceNode | null = null;
  private clicks: AudioBufferSourceNode[] = [];
  private frame = 0;
  private start = 0;
  private origin = 0;
  private pass = 0;
  private click: AudioBuffer | null = null;
  private metronome: AudioBufferSourceNode | null = null;
  private clickGain: GainNode | null = null;
  private clickEnabled = false;

  constructor(readonly context: AudioContext) {}

  async prepareClick(signal: AbortSignal) {
    if (this.click) return;
    const response = await fetch(clickUrl, { signal });
    if (!response.ok) throw new Error('The metronome click could not load.');
    this.click = await this.context.decodeAudioData(await response.arrayBuffer());
  }

  setClick(enabled: boolean) {
    this.clickEnabled = enabled;
    if (this.clickGain) {
      const gain = this.clickGain.gain;
      gain.cancelScheduledValues(this.context.currentTime);
      gain.setTargetAtTime(enabled ? 0.55 : 0, this.context.currentTime, 0.003);
    }
  }

  startLoop(
    buffer: AudioBuffer,
    endTick: number,
    bpm: number,
    countIn: boolean,
    onPosition: (position: LoopPosition) => void,
    onPass: (ended: number) => void,
    onBeat?: (at: number) => void,
  ) {
    this.stop();
    this.pass = 0;
    const lead = 0.05;
    this.start = this.context.currentTime + lead + (countIn ? (4 * 60) / bpm : 0);
    this.origin = performance.now() / 1000 + this.start - this.context.currentTime;
    if (countIn && this.click)
      for (let beat = 0; beat < 4; beat++) {
        const node = this.context.createBufferSource();
        node.buffer = this.click;
        node.connect(this.context.destination);
        node.start(this.start - ((4 - beat) * 60) / bpm);
        this.clicks.push(node);
      }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    source.connect(this.context.destination);
    source.start(this.start);
    this.source = source;
    const beats = endTick / 960;
    const beatDuration = buffer.duration / beats;
    if (this.click) {
      const gain = this.context.createGain();
      gain.gain.value = this.clickEnabled ? 0.55 : 0;
      gain.connect(this.context.destination);
      const metronome = this.context.createBufferSource();
      metronome.buffer = loopClickBuffer(this.context, this.click, buffer.length, beats);
      metronome.loop = true;
      metronome.loopStart = 0;
      metronome.loopEnd = buffer.duration;
      metronome.connect(gain);
      metronome.start(this.start);
      this.metronome = metronome;
      this.clickGain = gain;
    }
    // Establish the exact first origin even if the tab's animation frames stall.
    onPosition({ tick: 0, origin: this.origin, pass: 0 });
    let lastBeat = -5;
    const update = () => {
      if (this.source !== source) return;
      const elapsed = this.context.currentTime - this.start;
      const beat =
        elapsed < 0 ? Math.floor(elapsed / (60 / bpm)) : Math.floor(elapsed / beatDuration);
      if (beat !== lastBeat && (elapsed >= 0 || (countIn && beat >= -4))) {
        lastBeat = beat;
        onBeat?.(this.origin + beat * (elapsed < 0 ? 60 / bpm : beatDuration));
      }
      if (elapsed >= 0) {
        const pass = Math.floor(elapsed / buffer.duration);
        while (this.pass < pass) {
          this.pass++;
          onPass(this.origin + this.pass * buffer.duration);
          if (this.source !== source) return;
        }
        onPosition({
          tick: Math.min(
            endTick - 1,
            Math.floor(((elapsed % buffer.duration) / buffer.duration) * endTick),
          ),
          origin: this.origin + pass * buffer.duration,
          pass,
        });
      }
      this.frame = requestAnimationFrame(update);
    };
    this.frame = requestAnimationFrame(update);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    for (const click of this.clicks) {
      click.stop();
      click.disconnect();
    }
    this.clicks = [];
    this.metronome?.stop();
    this.metronome?.disconnect();
    this.metronome = null;
    this.clickGain?.disconnect();
    this.clickGain = null;
  }
}
