import { describe, expect, it } from 'vitest';
import { StablePitch, tunerReading, tunings } from '../../src/audio/tuner';
import { estimatePitch } from '../../src/audio/pitch';

describe('instrument tuner', () => {
  it('reports flat, sharp and centered notes in cents', () => {
    expect(tunerReading(69)).toMatchObject({
      note: 69,
      frequency: 440,
      cents: 0,
      direction: 'in-tune',
    });
    expect(tunerReading(40.23)).toMatchObject({ note: 40, cents: 23, direction: 'sharp' });
    expect(tunerReading(27.76)).toMatchObject({ note: 28, cents: -24, direction: 'flat' });
    expect(tunerReading(40.04)?.direction).toBe('in-tune');
    expect(tunerReading(null)).toBeNull();
    expect(tunerReading(NaN)).toBeNull();
  });
  it('uses the selected reference pitch and holds a manually selected string target', () => {
    expect(tunerReading(69 + 12 * Math.log2(442 / 440), null, 442)).toMatchObject({
      note: 69,
      cents: 0,
    });
    expect(tunerReading(41.1, 40)).toMatchObject({ note: 40, cents: 110 });
    expect(tunerReading(69, null, 0)).toBeNull();
  });
  it('rejects unstable, clipped and stale readings', () => {
    const stable = new StablePitch();
    const estimate = (midi: number | null) => ({ midi, confidence: 0.99, rms: 0.2 });
    expect(stable.update(estimate(40.01), false)).toBeNull();
    expect(stable.update(estimate(40.04), false)).toBeNull();
    expect(stable.update(estimate(40.02), false)).toBe(40.02);
    expect(stable.update(estimate(45), false)).toBeNull();
    expect(stable.update(estimate(45), true)).toBeNull();
    expect(stable.update(estimate(null), false)).toBeNull();
    expect(stable.update({ ...estimate(45), confidence: 0.7 }, false)).toBeNull();
  });
  it.each([23, 28, 38, 40, 45, 64])(
    'tunes clean MIDI %i fixtures within five cents at both sample rates',
    (midi) => {
      for (const rate of [44100, 48000]) {
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        const buffer = Float32Array.from(
          { length: 4096 },
          (_, i) => 0.2 * Math.sin((2 * Math.PI * frequency * i) / rate),
        );
        const result = tunerReading(estimatePitch(buffer, rate).midi);
        expect(result?.note).toBe(midi);
        expect(Math.abs(result!.cents)).toBeLessThanOrEqual(5);
      }
    },
  );
  it('offers the low B for five-string bass and drop D for guitar', () => {
    expect(tunings.find((t) => t.id === 'bass-5')?.notes[0]).toBe(23);
    expect(tunings.find((t) => t.id === 'drop-d')?.notes[0]).toBe(38);
  });
});
