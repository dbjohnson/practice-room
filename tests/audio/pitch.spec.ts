import { describe, expect, test } from 'vitest';

import { frequencyToNote } from '../../src/audio/pitch';

describe('frequencyToNote', () => {
  test('A4 (440 Hz) maps to A4 with zero cents', () => {
    const result = frequencyToNote(440);
    expect(result.noteName).toBe('A4');
    expect(result.cents).toBe(0);
  });

  test('maps C4 correctly', () => {
    expect(frequencyToNote(261.63).noteName).toBe('C4');
  });

  test('a slightly sharp A4 reports a positive cent deviation', () => {
    const result = frequencyToNote(445);
    expect(result.noteName).toBe('A4');
    expect(result.cents).toBeGreaterThan(0);
    expect(result.cents).toBeLessThanOrEqual(20);
  });

  test('a slightly flat A4 reports a negative cent deviation', () => {
    const result = frequencyToNote(435);
    expect(result.noteName).toBe('A4');
    expect(result.cents).toBeLessThan(0);
    expect(result.cents).toBeGreaterThanOrEqual(-20);
  });

  test('cents stay within a semitone range', () => {
    // Halfway between A4 and A#4 (~466 Hz)
    const result = frequencyToNote(466.16);
    expect(result.cents).toBeGreaterThanOrEqual(-50);
    expect(result.cents).toBeLessThanOrEqual(50);
  });

  test('rounds to the nearest note for high frequencies', () => {
    const result = frequencyToNote(880);
    expect(result.noteName).toBe('A5');
    expect(result.cents).toBe(0);
  });
});
