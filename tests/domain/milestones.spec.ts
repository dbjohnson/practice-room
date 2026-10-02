import { expect, it } from 'vitest';
import { practiceMilestones } from '../../src/domain/milestones';
import type { Take } from '../../src/domain/types';
const take: Take = {
  id: 'a',
  pieceId: 'p',
  pieceTitle: 'Study',
  trackName: 'Bass',
  tempo: 80,
  range: { start: 1, end: 2 },
  origin: 'microphone',
  notes: [],
  pitchAccuracy: 95,
  timingMs: 20,
  timingScore: 95,
  overallScore: 95,
  coverage: 95,
  duration: 8,
  calibrated: false,
  rubric: 'mono-v1',
  createdAt: '2026-09-29T12:00:00Z',
};
it('earns milestones from comparable real takes, never illustrative or partial ones', () => {
  expect(practiceMilestones([{ ...take, origin: 'example' }]).map((m) => m.earned)).toEqual([
    false,
    false,
    false,
  ]);
  expect(
    practiceMilestones([take, { ...take, id: 'b', createdAt: '2026-09-30T12:00:00Z' }]).map(
      (m) => m.earned,
    ),
  ).toEqual([true, true, true]);
  for (const difference of [
    { tempo: 84 },
    { transpose: 3 },
    { trackName: 'Guitar' },
    { coverage: 20 },
    { timingCoverage: 20 },
    { timingScore: 40 },
    { interrupted: true },
    { range: { start: 2, end: 3 } },
  ]) {
    expect(practiceMilestones([take, { ...take, id: 'b', ...difference }])[2].earned).toBe(false);
  }
});
