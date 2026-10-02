import type { synth } from '@coderline/alphatab';
import { PlaybackEffects } from './PlaybackEffects';

/** Process only the synth's public PCM output, keeping its sample count and clock. */
export function attachPlaybackEffects(output: synth.ISynthOutput) {
  const processor = new PlaybackEffects(output.sampleRate);
  const { addSamples, resetSamples, pause } = output;
  const processed = (samples: Float32Array) => addSamples.call(output, processor.process(samples));
  const reset = () => {
    processor.reset();
    resetSamples.call(output);
  };
  const paused = () => {
    processor.reset();
    pause.call(output);
  };
  output.addSamples = processed;
  output.resetSamples = reset;
  output.pause = paused;
  return {
    configure: processor.configure.bind(processor),
    dispose() {
      processor.reset();
      if (output.addSamples === processed) output.addSamples = addSamples;
      if (output.resetSamples === reset) output.resetSamples = resetSamples;
      if (output.pause === paused) output.pause = pause;
    },
  };
}
