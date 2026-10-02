import { expect, it } from 'vitest';
import { detectTransients } from '../../src/audio/transients';

it('detects raw attacks without pitch recognition and ignores their ringing tails', () => {
  const rate = 48000;
  const audio = new Float32Array(12 * rate);
  const times = Array.from({ length: 32 }, (_, i) => 0.28 + i / 3);
  for (const time of times) {
    const at = Math.round(time * rate);
    for (let i = 0; i < rate * 0.22; i++)
      audio[at + i] += 0.35 * Math.exp(-i / (rate * 0.04)) * Math.sin(i * 0.09);
  }
  const hits = detectTransients(audio, rate);
  expect(hits).toHaveLength(32);
  hits.forEach((hit, i) => expect(Math.abs(hit - times[i])).toBeLessThan(0.004));
  expect(detectTransients(new Float32Array(rate), rate)).toEqual([]);
});
