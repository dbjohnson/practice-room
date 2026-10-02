import { expect, it } from 'vitest';
import { amplitudeToDb, levelGuidance } from '../../src/audio/inputLevels';
it('keeps silence and invalid levels at the meter floor', () => {
  expect(amplitudeToDb(0)).toBe(-60);
  expect(amplitudeToDb(0.5)).toBeCloseTo(-6.0206, 3);
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
