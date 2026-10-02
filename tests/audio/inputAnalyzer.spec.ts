import { describe, expect, it } from 'vitest';
import { InputAnalyzer, type InputFrame } from '../../src/audio/inputAnalyzer';
import type { Observation } from '../../src/domain/types';
import { renderLine, type SynthNote } from './synth';

function analyze(samples: Float32Array, sampleRate: number, startTime = 0) {
  const frames: InputFrame[] = [];
  const observations: Observation[] = [];
  const analyzer = new InputAnalyzer(
    sampleRate,
    (frame) => frames.push(frame),
    (observation) => observations.push(observation),
  );
  // Audio worklets deliver 128-sample blocks.
  for (let i = 0; i < samples.length; i += 128)
    analyzer.push(samples.subarray(i, i + 128), startTime + i / sampleRate);
  return { frames, observations };
}
const line = (midis: number[], gap: number, first = 0.2): SynthNote[] =>
  midis.map((midi, i) => ({ midi, time: first + i * gap }));
function expectLine(notes: SynthNote[], observations: Observation[], tolerance = 0.012) {
  expect(observations.map((o) => (o.midi === null ? null : Math.round(o.midi)))).toEqual(
    notes.map((n) => n.midi),
  );
  observations.forEach((o, i) => {
    expect(Math.abs(o.time - notes[i].time)).toBeLessThan(tolerance);
    expect(o.confidence).toBeGreaterThanOrEqual(0.88);
  });
}

describe('streaming note detection', () => {
  it.each([44100, 48000])('times and names a guitar melody at %i Hz', (rate) => {
    const notes = line([64, 67, 69, 71, 69, 67, 64, 62], 0.3);
    expectLine(notes, analyze(renderLine(notes, rate, 2.9), rate).observations);
  });
  it('hears every attack of a repeated note', () => {
    const notes = line([57, 57, 57, 57, 57, 57], 0.25);
    expectLine(notes, analyze(renderLine(notes, 48000, 2), 48000).observations);
  });
  it('keeps up with sixteenth notes at 120 BPM', () => {
    const notes = line([60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65], 0.125);
    expectLine(notes, analyze(renderLine(notes, 48000, 2), 48000).observations);
  });
  it('follows low bass notes', () => {
    const notes = line([28, 33, 28, 35, 23], 0.4);
    expectLine(notes, analyze(renderLine(notes, 44100, 2.6), 44100).observations, 0.015);
  });
  it('times attacks over ringing strings and through hiss', () => {
    const notes: SynthNote[] = [
      { midi: 52, time: 0.2, ring: true, amplitude: 0.5 },
      { midi: 59, time: 0.5, ring: true, amplitude: 0.2 },
      { midi: 64, time: 0.8, amplitude: 0.15 },
    ];
    // The pitch of a note over louder ringing strings is a chord; only timing is expected.
    const heard = analyze(renderLine(notes, 48000, 1.5, 0.003), 48000).observations;
    expect(heard.map((o) => Math.round(o.time * 100))).toEqual([20, 50, 80]);
  });
  it('hears a quiet note straight after a loud one', () => {
    const notes: SynthNote[] = [
      { midi: 67, time: 0.2, amplitude: 0.4 },
      { midi: 62, time: 0.5, amplitude: 0.08 },
      { midi: 62, time: 0.8, amplitude: 0.3 },
    ];
    expectLine(notes, analyze(renderLine(notes, 48000, 1.5, 0.003), 48000).observations);
  });
  it.each([28, 52, 76])('reports one note for a long MIDI %i decaying into hiss', (midi) => {
    const notes = line([midi], 1);
    expectLine(notes, analyze(renderLine(notes, 48000, 4, 0.003), 48000).observations, 0.015);
  });
  it('hears a hammer-on without a new attack', () => {
    const notes: SynthNote[] = [
      { midi: 62, time: 0.2 },
      { midi: 64, time: 0.6, legato: true },
    ];
    expectLine(notes, analyze(renderLine(notes, 48000, 1.4), 48000).observations, 0.04);
  });
  it('uses the supplied clock for timestamps', () => {
    const notes = line([64], 1);
    const { observations, frames } = analyze(renderLine(notes, 48000, 1), 48000, 100);
    expect(observations[0].time).toBeCloseTo(100.2, 1);
    expect(frames.at(-1)!.time).toBeGreaterThan(100.9);
  });
  it('stays quiet in silence and marks clipped notes as unclear', () => {
    expect(analyze(new Float32Array(48000), 48000).observations).toEqual([]);
    const loud = renderLine([{ midi: 64, time: 0.2, amplitude: 4 }], 48000, 1).map((x) =>
      Math.max(-1, Math.min(1, x)),
    );
    const { observations, frames } = analyze(loud, 48000);
    expect(observations[0].confidence).toBe(0);
    expect(frames.some((frame) => frame.clipped)).toBe(true);
  });
  it('reports level and tuner pitch about 25 times a second', () => {
    const { frames } = analyze(renderLine(line([45], 1), 48000, 1.2), 48000);
    expect(frames.length).toBeGreaterThan(25);
    const ringing = frames.filter((frame) => frame.time > 0.4 && frame.time < 1);
    for (const frame of ringing) expect(frame.midi).toBeCloseTo(45, 1);
    expect(Math.max(...frames.map((frame) => frame.peak))).toBeGreaterThan(0.1);
  });
});
