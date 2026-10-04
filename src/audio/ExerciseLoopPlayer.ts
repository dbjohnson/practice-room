import { TrackLoopSources, type LoopStem, type LoopMix } from './TrackLoopSources';
import type { LoopTiming } from './loopMidi';
import clickUrl from './assets/woody-block.wav?url';
import { loopClickBuffer } from './loopClickBuffer';

export interface LoopPosition {
  tick: number;
  origin: number;
  pass: number;
  time?: number;
}

/** One native looping source owns all wrap points; JS only observes its clock. */
export class ExerciseLoopPlayer {
  private usingStems = false;
  private source: AudioBufferSourceNode | null = null;
  private clicks: AudioBufferSourceNode[] = [];
  private frame = 0;
  private start = 0;
  private origin = 0;
  private pass = 0;
  private duration = 0;
  private endAfterPass = Infinity;
  private click: AudioBuffer | null = null;
  private metronome: AudioBufferSourceNode | null = null;
  private clickGain: GainNode | null = null;
  private clickEnabled = false;
  private clickVolume = 55;

  private tracks: TrackLoopSources;

  constructor(readonly context: AudioContext) {
    this.tracks = new TrackLoopSources(context);
  }

  setLooping(looping: boolean) {
    this.endAfterPass = looping
      ? Infinity
      : Math.max(1, Math.floor((this.context.currentTime - this.start) / this.duration) + 1);
    if (this.source) this.source.loop = looping;
    if (this.metronome) this.metronome.loop = looping;
    this.tracks.setLooping(looping);
  }

  setMix(mix: LoopMix) {
    this.tracks.setMix(mix);
  }

  async prepareClick(signal: AbortSignal) {
    if (this.click) return;
    const response = await fetch(clickUrl, { signal });
    if (!response.ok) throw new Error('The metronome click could not load.');
    this.click = await this.context.decodeAudioData(await response.arrayBuffer());
  }

  setClick(enabled: boolean, volume = this.clickVolume) {
    this.clickEnabled = enabled;
    this.clickVolume = Math.max(0, Math.min(100, volume));
    if (this.clickGain) {
      const gain = this.clickGain.gain;
      gain.cancelScheduledValues(this.context.currentTime);
      gain.setTargetAtTime(enabled ? this.clickVolume / 100 : 0, this.context.currentTime, 0.003);
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
    timing?: LoopTiming,
    stems?: LoopStem[],
    mix: LoopMix = { muted: [], volumes: {} },
    offset = 0,
    onEnded?: () => void,
  ) {
    this.stop();
    this.pass = 0;
    this.duration = buffer.duration;
    this.endAfterPass = Infinity;
    const lead = 0.05;
    const countBeats = timing?.countInBeats ?? 4;
    const countStep = timing?.countInBeatDuration ?? 60 / bpm;
    this.start = this.context.currentTime + lead + (countIn ? countBeats * countStep : 0);
    const sourceStart = this.start;
    this.start -= offset;
    this.origin = performance.now() / 1000 + this.start - this.context.currentTime;
    if (this.click) {
      this.clickGain = this.context.createGain();
      this.clickGain.gain.value = this.clickEnabled ? this.clickVolume / 100 : 0;
      this.clickGain.connect(this.context.destination);
    }
    if (countIn && this.click)
      for (let beat = 0; beat < countBeats; beat++) {
        const node = this.context.createBufferSource();
        node.buffer = this.click;
        node.connect(this.clickGain!);
        node.start(this.start - (countBeats - beat) * countStep);
        this.clicks.push(node);
      }
    const source = stems
      ? this.tracks.start(stems, sourceStart, mix, offset)!
      : this.context.createBufferSource();
    if (!stems) {
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      source.connect(this.context.destination);
      if (offset) source.start(sourceStart, offset);
      else source.start(sourceStart);
    }
    this.source = source;
    source.onended = () => {
      if (this.source !== source || this.endAfterPass === Infinity) return;
      this.stop();
      onEnded?.();
    };
    this.usingStems = !!stems;
    const beats = endTick / 960;
    const beatDuration = buffer.duration / beats;
    if (this.click) {
      const gain = this.clickGain!;
      const metronome = this.context.createBufferSource();
      metronome.buffer = loopClickBuffer(
        this.context,
        this.click,
        buffer.length,
        beats,
        timing?.beatTimes,
      );
      metronome.loop = true;
      metronome.loopStart = 0;
      metronome.loopEnd = buffer.duration;
      metronome.connect(gain);
      if (offset) metronome.start(sourceStart, offset);
      else metronome.start(sourceStart);
      this.metronome = metronome;
      this.clickGain = gain;
    }
    // Establish the exact first origin even if the tab's animation frames stall.
    onPosition({
      tick: timing?.tickAt(offset) ?? 0,
      origin: this.origin,
      pass: 0,
      time: this.origin + offset,
    });
    let lastBeat = -5;
    const update = () => {
      if (this.source !== source) return;
      const elapsed = this.context.currentTime - this.start;
      const cycle = Math.floor(elapsed / buffer.duration);
      const localTime = elapsed - cycle * buffer.duration;
      const times = timing?.beatTimes;
      const localBeat = times
        ? times.reduce((found, time, index) => (time <= localTime ? index : found), -1)
        : Math.floor(localTime / beatDuration);
      const beat =
        elapsed < 0
          ? Math.floor(elapsed / countStep)
          : cycle * (times?.length ?? beats) + localBeat;
      if (beat !== lastBeat && (elapsed >= 0 || (countIn && beat >= -countBeats))) {
        lastBeat = beat;
        onBeat?.(
          this.origin +
            (elapsed < 0
              ? beat * countStep
              : cycle * buffer.duration + (times?.[localBeat] ?? localBeat * beatDuration)),
        );
      }
      if (elapsed >= 0) {
        const pass = Math.floor(elapsed / buffer.duration);
        if (pass >= this.endAfterPass) return;
        while (this.pass < pass) {
          this.pass++;
          onPass(this.origin + this.pass * buffer.duration);
          if (this.source !== source) return;
        }
        onPosition({
          tick:
            timing?.tickAt(elapsed % buffer.duration) ??
            Math.min(
              endTick - 1,
              Math.floor(((elapsed % buffer.duration) / buffer.duration) * endTick),
            ),
          origin: this.origin + pass * buffer.duration,
          pass,
          time: this.origin + elapsed,
        });
      }
      this.frame = requestAnimationFrame(update);
    };
    this.frame = requestAnimationFrame(update);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.tracks.stop();
    if (this.source && !this.usingStems) {
      this.source.stop();
      this.source.disconnect();
    }
    this.source = null;
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
