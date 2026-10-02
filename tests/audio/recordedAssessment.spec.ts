import { describe, expect, it } from 'vitest';
import { recordedObservations } from '../../src/audio/recordedAssessment';
import {
  calibrationPattern,
  detectTransients,
  estimateLatency,
} from '../../src/audio/latencyCalibration';
import { assess } from '../../src/audio/assessment';

const rate = 48000;
function recording(times: number[], duration = 0.2) {
  const samples = new Float32Array(Math.ceil((times.at(-1)! + duration + 0.1) * rate));
  for (const at of times) {
    for (let i = 0; i < duration * rate; i++) {
      const index = Math.round(at * rate) + i;
      samples[index] =
        0.3 *
        Math.min(1, i / 96) *
        Math.exp(-i / rate / 0.08) *
        Math.sin((2 * Math.PI * 220 * i) / rate);
    }
  }
  return samples;
}

describe('recorded take grading', () => {
  it.each([0.07, 0.2])(
    'keeps transient times while finding pitch in %s second notes',
    (duration) => {
      const notes = recordedObservations(recording([0.2, 0.533, 0.866], duration), rate);
      expect(notes).toHaveLength(3);
      for (const [index, note] of notes.entries()) {
        expect(note.time).toBeCloseTo([0.2, 0.533, 0.866][index], 2);
        expect(note.midi).toBeCloseTo(57, 0);
        expect(note.confidence).toBeGreaterThan(0.88);
      }
    },
  );
  it('retains every eighth-note attack at 240 BPM', () => {
    const times = Array.from({ length: 16 }, (_, i) => 0.2 + i * 0.125);
    const notes = recordedObservations(recording(times, 0.07), rate);
    expect(notes).toHaveLength(16);
    notes.forEach((note, i) => expect(Math.abs(note.time - times[i])).toBeLessThan(0.004));
  });
  it.each([-45, 80])('calibrates %i ms from raw audio and applies that offset once', (offset) => {
    const raw = recording(calibrationPattern.map((t) => t + offset / 1000));
    const estimate = estimateLatency(detectTransients(raw, rate));
    expect(estimate.reliable).toBe(true);
    expect(estimate.offsetMs).toBeCloseTo(offset, -1);
    // Calibration has no saved-offset input. Repeating with the same raw PCM is unchanged.
    expect(estimateLatency(detectTransients(raw, rate))).toEqual(estimate);
    const take = recording([0.5 + offset / 1000]);
    // Take audio starts at playback origin + measured offset, removing it exactly once.
    const shift = Math.round((estimate.offsetMs * rate) / 1000);
    const aligned = shift >= 0 ? take.slice(shift) : new Float32Array(take.length - shift);
    if (shift < 0) aligned.set(take, -shift);
    const notes = assess(
      [{ tick: 480, midi: 57, bar: 1, beatId: 0, eligible: true }],
      recordedObservations(aligned, rate),
      60,
      0,
    );
    expect(notes[0].status).toBe('matched');
    expect(Math.abs(notes[0].delta!)).toBeLessThanOrEqual(3);
  });
  it('does not invent notes for silence or clipped input', () => {
    expect(recordedObservations(new Float32Array(rate), rate)).toEqual([]);
    const clipped = recording([0.2]);
    for (let i = Math.round(0.2 * rate); i < 0.3 * rate; i++) clipped[i] = 1;
    expect(recordedObservations(clipped, rate)[0].midi).toBeNull();
  });
});
