import type { Observation } from '../domain/types';
import { InputAnalyzer, type InputFrame } from './inputAnalyzer';

// Globals of the AudioWorkletGlobalScope, which TypeScript's DOM library omits.
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

export type InputMessage =
  { type: 'frame'; frame: InputFrame } | { type: 'observation'; observation: Observation };

// Runs note detection on the audio thread so playback and notation never delay it,
// and stamps attacks with the audio clock rather than a timer.
class InputProcessor extends AudioWorkletProcessor {
  private analyzer = this.create();

  constructor() {
    super();
    // A new input channel starts with no memory of the previous one.
    this.port.onmessage = () => (this.analyzer = this.create());
  }

  private create() {
    return new InputAnalyzer(
      sampleRate,
      (frame) => this.port.postMessage({ type: 'frame', frame } satisfies InputMessage),
      (observation) =>
        this.port.postMessage({ type: 'observation', observation } satisfies InputMessage),
    );
  }

  process(inputs: Float32Array[][]) {
    const channel = inputs[0]?.[0];
    if (channel?.length) this.analyzer.push(channel, currentFrame / sampleRate);
    return true;
  }
}
registerProcessor('practice-room-input', InputProcessor);
