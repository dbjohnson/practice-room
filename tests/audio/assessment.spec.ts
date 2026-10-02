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
    expect(summarize(result)).toEqual({
      pitchAccuracy: 100,
      timingMs: 27.5,
      coverage: 100,
      timingScore: 98,
      timingCoverage: 100,
      overallScore: 99,
    });
  });
  it('does not penalize absent or ambiguous input', () => {
    expect(assess([note(0)], [], 60, 0)[0].status).toBe('unclear');
    expect(assess([note(0)], [heard(0, 60, 0.5)], 60, 0)[0].status).toBe('unclear');
    expect(assess([note(0)], [{ ...heard(0), rms: 0.9 }], 60, 0)[0].status).toBe('unclear');
    expect(assess([note(0, false)], [heard(0)], 60, 0)[0].status).toBe('unclear');
    expect(summarize([])).toEqual({
      pitchAccuracy: null,
      timingMs: null,
      coverage: 0,
      timingScore: null,
      timingCoverage: 0,
      overallScore: null,
    });
  });
  it('separates wrong pitch and missed notes when a signal was present', () => {
    const result = assess([note(0), note(960), note(1920)], [heard(0), heard(1.01, 61)], 60, 0);
    expect(result.map((n) => n.status)).toEqual(['matched', 'pitch', 'missed']);
    expect(summarize(result)).toEqual({
      pitchAccuracy: 33,
      timingMs: 5,
      coverage: 100,
      timingScore: 67,
      timingCoverage: 100,
      overallScore: 50,
    });
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

describe('combined note and timing scores', () => {
  it('scores all detected attacks for timing regardless of pitch confidence', () => {
    const targets = Array.from({ length: 8 }, (_, i) => note(i * 480));
    const observations = targets.map((n) => ({
      ...heard(n.tick / 960),
      midi: null,
      confidence: 0,
      timingReliable: true,
    }));
    const muted = summarize(assess(targets, observations, 60, 0));
    const pitched = summarize(
      assess(
        targets,
        observations.map((o) => ({ ...o, midi: 60, confidence: 0.99 })),
        60,
        0,
      ),
    );
    expect(muted).toMatchObject({
      timingScore: 100,
      timingCoverage: 100,
      pitchAccuracy: null,
      coverage: 0,
      overallScore: null,
    });
    expect(pitched).toMatchObject({
      timingScore: muted.timingScore,
      timingCoverage: muted.timingCoverage,
      pitchAccuracy: 100,
      coverage: 100,
    });
    // One clear attack cannot give a perfect timing score for an eight-note phrase.
    expect(summarize(assess(targets, [observations[0]], 60, 0)).timingScore).toBe(13);
    const mixed = observations.map((o, i) =>
      i === 0 ? { ...o, midi: 60, confidence: 0.99 } : { ...o, time: o.time + 0.1 },
    );
    expect(summarize(assess(targets, mixed, 60, 0))).toMatchObject({
      timingScore: 48,
      pitchAccuracy: 100,
      coverage: 13,
      overallScore: null,
    });
  });
  it('keeps uncertain or clipped attacks out of timing, without making pitch uncertainty lose timing credit', () => {
    const result = assess([note(0)], [{ ...heard(0), midi: null, timingReliable: false }], 60, 0);
    expect(summarize(result)).toMatchObject({ timingScore: null, timingCoverage: 0 });
    expect(
      assess([note(0, false)], [{ ...heard(0), timingReliable: true }], 60, 0)[0].timingStatus,
    ).toBe('unclear');
  });
  it('reduces the take score for late correct notes and on-time wrong notes independently', () => {
    expect(summarize(assess([note(0)], [heard(0.1)], 60, 0))).toMatchObject({
      pitchAccuracy: 100,
      timingScore: 40,
      overallScore: 70,
    });
    expect(summarize(assess([note(0)], [heard(0, 63)], 60, 0))).toMatchObject({
      pitchAccuracy: 0,
      timingScore: 100,
      overallScore: 50,
    });
    expect(summarize(assess([note(0)], [heard(-0.1)], 60, 0))).toMatchObject({
      timingScore: 40,
      overallScore: 70,
    });
  });
  it('does not give an overall score when too little input is assessable', () => {
    const results = assess([note(0), note(960, false), note(1920, false)], [heard(0)], 60, 0);
    expect(summarize(results)).toMatchObject({
      pitchAccuracy: 100,
      timingScore: 100,
      coverage: 33,
      overallScore: null,
    });
  });
  it('does not hide occasional late attacks behind a good median', () => {
    expect(coaching(take({ timingScore: 75, timingMs: 12 })).kind).toBe('timing');
  });
});
