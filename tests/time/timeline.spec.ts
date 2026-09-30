import { describe, expect, it } from 'vitest';
import {
  clampTempo,
  formatTime,
  normalizeRange,
  swingOffset,
  ticksToSeconds,
} from '../../src/time/timeline';

describe('practice timing', () => {
  it('bounds tempo and rejects non-finite input', () => {
    expect([20, 999, 80.6, NaN, Infinity].map(clampTempo)).toEqual([30, 240, 81, 80, 80]);
  });
  it('keeps a valid inclusive passage', () => {
    expect(normalizeRange({ start: -2, end: 99 }, 8)).toEqual({ start: 1, end: 8 });
    expect(normalizeRange({ start: 6, end: 2 }, 8)).toEqual({ start: 6, end: 6 });
    expect(normalizeRange({ start: NaN, end: NaN }, 0)).toEqual({ start: 1, end: 1 });
    expect(normalizeRange({ start: 2.8, end: 4.2 }, 8)).toEqual({ start: 2, end: 4 });
  });
  it.each([30, 60, 120, 240])('converts subdivisions at %i BPM', (bpm) => {
    expect(ticksToSeconds(960, bpm)).toBe(60 / bpm);
    expect(ticksToSeconds(240, bpm)).toBe(15 / bpm);
  });
  it('rejects invalid tempos', () => {
    for (const bpm of [0, -1, NaN, Infinity]) expect(() => ticksToSeconds(960, bpm)).toThrow();
  });
  it('places swing offbeats without drifting the next downbeat', () => {
    expect([0, 1, 2, 3, 4].map((x) => swingOffset(x))).toEqual([0, 2 / 3, 1, 1 + 2 / 3, 2]);
    expect(swingOffset(1, 1)).toBe(0.5);
    expect(swingOffset(1, 3)).toBe(0.75);
    for (const ratio of [0, -1, NaN]) expect(() => swingOffset(1, ratio)).toThrow();
  });
  it('formats durations without negative or invalid values', () => {
    expect([0, 65.8, -5, NaN, Infinity].map(formatTime)).toEqual([
      '0:00',
      '1:05',
      '0:00',
      '0:00',
      '0:00',
    ]);
  });
});
