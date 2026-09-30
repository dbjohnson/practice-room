/**
 * A simple audio sampler to load and play sound files.
 */
export class Sampler {
  private readonly audioContext: AudioContext;
  private buffers: Map<string, AudioBuffer> = new Map();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * Loads a map of sample names to audio file URLs.
   */
  async load(samples: { [name: string]: string }): Promise<void> {
    const promises = Object.entries(samples).map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.buffers.set(name, audioBuffer);
      } catch (error) {
        console.error(`Failed to load sample: ${name} from ${url}`, error);
      }
    });
    await Promise.all(promises);
  }

 /**
  * Plays a loaded sample at a specific time.
   * Returns the buffer source (for stop control) and the gain node built from
   * `gainValue`; the source is connected to the gain node but the gain node is
   * left unconnected so the caller can insert it into its own graph.
   */
  play(
    name: string,
    when: number,
    gainValue: number = 1.0,
  ): { source: AudioBufferSourceNode; gain: GainNode } | null {
    const buffer = this.buffers.get(name);
    if (!buffer) return null;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    const gain = this.audioContext.createGain();
    gain.gain.value = gainValue;

    source.connect(gain);
    source.start(when);
    return { source, gain };
  }
}
