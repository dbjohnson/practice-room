import { expect, it } from 'vitest';
import { amplitudeToDb, levelGuidance, measureInput } from '../../src/audio/inputLevels';
it('measures true sample peak on the selected channel, including negative peaks', () => {
  const level = measureInput(new Float32Array([0, 0.25, -0.5, 0.1]));
  expect(level.peak).toBe(0.5);
  expect(level.peakDb).toBeCloseTo(-6.0206, 3);
  expect(level.clipped).toBe(false);
  expect(measureInput(new Float32Array([-0.99])).clipped).toBe(true);
});
it('keeps silence and invalid levels at the meter floor', () => {
  expect(measureInput(new Float32Array(4096)).peakDb).toBe(-60);
  expect(amplitudeToDb(NaN)).toBe(-60);
  expect(amplitudeToDb(2)).toBe(0);
});
it('gives gain advice for silence, weak signal, headroom and clipping', () => {
  expect([-60, -40, -12, -3].map((db) => levelGuidance(db, false).kind)).toEqual([
    'quiet',
    'low',
    'good',
    'hot',
  ]);
  expect(levelGuidance(-12, true).kind).toBe('clip');
});
