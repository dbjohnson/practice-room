import { describe, expect, it } from 'vitest';
import { estimatePitch } from '../../src/audio/pitch';
const sine = (midi: number, rate: number, amplitude = 0.2) =>
  Float32Array.from(
    { length: 4096 },
    (_, i) => amplitude * Math.sin((2 * Math.PI * (440 * 2 ** ((midi - 69) / 12)) * i) / rate),
  );
describe('isolated instrument pitch estimation', () => {
  it.each([23, 28, 40, 52, 64, 69, 84])('resolves MIDI %i without octave error', (midi) => {
    for (const rate of [44100, 48000]) {
      const pitch = estimatePitch(sine(midi, rate), rate);
      expect(pitch.midi).not.toBeNull();
      expect(Math.abs(pitch.midi! - midi)).toBeLessThan(0.1);
      expect(pitch.confidence).toBeGreaterThan(0.95);
    }
  });
  it('rejects silence, DC, empty input and invalid rates', () => {
    for (const buffer of [
      new Float32Array(4096),
      new Float32Array(4096).fill(0.1),
      new Float32Array(),
      sine(69, 48000, 0.001),
    ])
      expect(estimatePitch(buffer, 48000).midi).toBeNull();
    expect(estimatePitch(sine(69, 48000), 0).midi).toBeNull();
  });
  it('handles clean harmonic tone and constant DC offset', () => {
    const tone = sine(40, 48000);
    const overtone = sine(52, 48000, 0.06);
    tone.forEach((x, i) => {
      tone[i] = x + overtone[i] + 0.05;
    });
    expect(estimatePitch(tone, 48000).midi).toBeCloseTo(40, 1);
  });
});
