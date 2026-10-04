export interface LoopStem {
  track: number;
  buffer: AudioBuffer;
}
export interface LoopMix {
  muted: number[];
  routed?: number[];
  volumes: Record<number, number>;
}

/** All stems start on the same audio sample; faders never replace or restart them. */
export class TrackLoopSources {
  private nodes: { track: number; source: AudioBufferSourceNode; gain: GainNode; level: number }[] =
    [];
  constructor(private context: AudioContext) {}

  start(stems: LoopStem[], at: number, mix: LoopMix, offset = 0) {
    this.stop();
    for (const stem of stems) {
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      source.buffer = stem.buffer;
      source.loop = true;
      source.loopEnd = stem.buffer.duration;
      gain.gain.value = this.level(stem.track, mix);
      source.connect(gain);
      gain.connect(this.context.destination);
      if (offset) source.start(at, offset);
      else source.start(at);
      this.nodes.push({ track: stem.track, source, gain, level: gain.gain.value });
    }
    return this.nodes[0]?.source ?? null;
  }

  setLooping(looping: boolean) {
    for (const node of this.nodes) node.source.loop = looping;
  }

  setMix(mix: LoopMix) {
    for (const node of this.nodes) {
      const { track, gain } = node;
      const level = this.level(track, mix);
      if (node.level === level) continue;
      node.level = level;
      gain.gain.cancelScheduledValues(this.context.currentTime);
      gain.gain.setTargetAtTime(level, this.context.currentTime, 0.005);
    }
  }

  private level(track: number, mix: LoopMix) {
    return mix.muted.includes(track) || mix.routed?.includes(track)
      ? 0
      : (mix.volumes[track] ?? 80) / 100;
  }

  stop() {
    for (const { source, gain } of this.nodes) {
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.nodes = [];
  }
}
