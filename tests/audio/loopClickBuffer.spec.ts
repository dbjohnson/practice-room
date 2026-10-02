import { expect, it } from 'vitest';
import { loopClickBuffer } from '../../src/audio/loopClickBuffer';

it('places clicks at evenly spaced sample boundaries and carries their tails through the wrap', () => {
  const samples = new Float32Array(10);
  const context = {
    sampleRate: 10,
    createBuffer: (_channels: number, length: number, rate: number) => {
      expect(length).toBe(10);
      expect(rate).toBe(10);
      return { getChannelData: () => samples };
    },
  } as unknown as AudioContext;
  // Three frames per attack; last beat begins on frame 8 and wraps its tail to frame 0.
  const click = {
    getChannelData: () => new Float32Array([0.5, 0.25, 0.125]),
  } as unknown as AudioBuffer;
  loopClickBuffer(context, click, 10, 4);
  expect([...samples]).toEqual([0.625, 0.25, 0.125, 0.5, 0.25, 0.625, 0.25, 0.125, 0.5, 0.25]);
});
