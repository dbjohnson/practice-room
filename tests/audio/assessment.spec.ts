import { describe, expect, it } from 'vitest';
import { assess, coaching, exampleNotes, summarize } from '../../src/audio/assessment';
import type { ExpectedNote, Observation, Take } from '../../src/domain/types';
const note = (tick: number, eligible = true): ExpectedNote => ({
  tick,
  midi: 60,
  bar: 1,
  beatId: tick,
  eligible,
});
const heard = (time: number, midi = 60, confidence = 0.99): Observation => ({
  time,
  midi,
  confidence,
  rms: 0.2,
});
const take = (change: Partial<Take>): Take => ({
  id: 'test',
  createdAt: '',
  pieceId: 'test',
  pieceTitle: '',
  trackName: '',
  tempo: 60,
  range: { start: 1, end: 1 },
  origin: 'microphone',
  notes: [],
  pitchAccuracy: 100,
  timingMs: 12,
  coverage: 100,
  duration: 4,
  calibrated: false,
  rubric: 'mono-v1',
  ...change,
});
describe('confidence-aware take feedback', () => {
  it('aligns against the selected passage and reports signed timing', () => {
    const result = assess([note(3840), note(4800)], [heard(0.025), heard(0.97)], 60, 3840);
    expect(result.map((n) => n.status)).toEqual(['matched', 'matched']);
    expect(result.map((n) => n.delta)).toEqual([25, -30]);
    expect(summarize(result)).toEqual({ pitchAccuracy: 100, timingMs: 27.5, coverage: 100 });
  });
  it('does not penalize absent or ambiguous input', () => {
    expect(assess([note(0)], [], 60, 0)[0].status).toBe('unclear');
    expect(assess([note(0)], [heard(0, 60, 0.5)], 60, 0)[0].status).toBe('unclear');
    expect(assess([note(0)], [{ ...heard(0), rms: 0.9 }], 60, 0)[0].status).toBe('unclear');
    expect(assess([note(0, false)], [heard(0)], 60, 0)[0].status).toBe('unclear');
    expect(summarize([])).toEqual({ pitchAccuracy: null, timingMs: null, coverage: 0 });
  });
  it('separates wrong pitch and missed notes when a signal was present', () => {
    const result = assess([note(0), note(960), note(1920)], [heard(0), heard(1.01, 61)], 60, 0);
    expect(result.map((n) => n.status)).toEqual(['matched', 'pitch', 'missed']);
    expect(summarize(result)).toEqual({ pitchAccuracy: 33, timingMs: 0, coverage: 100 });
  });
  it('does not reuse a detected attack for multiple target notes', () => {
    const result = assess([note(0), note(120)], [heard(0.03)], 240, 0);
    expect(result.filter((n) => n.status === 'matched')).toHaveLength(1);
  });
  it('applies explicit latency compensation in the matcher', () => {
    expect(assess([note(0)], [heard(0.07)], 60, 0, 70)[0].delta).toBe(0);
  });
  it('prioritizes signal quality, then notes, then timing', () => {
    expect(coaching(take({ coverage: 20 })).kind).toBe('input');
    expect(
      coaching(take({ notes: assess([note(0), note(960)], [heard(0, 62), heard(1, 62)], 60, 0) }))
        .kind,
    ).toBe('pitch');
    expect(coaching(take({ timingMs: 42 })).kind).toBe('timing');
    expect(coaching(take({})).kind).toBe('advance');
  });
  it('generates deterministic illustrative evidence without mutating targets', () => {
    const targets = Array.from({ length: 20 }, (_, i) => note(i * 960));
    expect(exampleNotes(targets)).toEqual(exampleNotes(targets));
    expect(exampleNotes(targets).some((n) => n.status === 'pitch')).toBe(true);
    expect(exampleNotes(targets).some((n) => n.status === 'unclear')).toBe(true);
    expect(targets[7].midi).toBe(60);
  });
});
