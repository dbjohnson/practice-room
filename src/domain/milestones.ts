import type { Take } from './types';

export function practiceMilestones(takes: Take[]) {
  const real = takes.filter((t) => t.origin !== 'example');
  const days = new Set(real.map((t) => new Date(t.createdAt).toLocaleDateString()));
  const comparable = new Map<string, number>();
  for (const take of real) {
    if (
      take.interrupted ||
      take.coverage < 90 ||
      (take.timingCoverage ?? take.coverage) < 90 ||
      (take.pitchAccuracy ?? 0) < 90 ||
      (take.timingScore ?? 0) < 90
    )
      continue;
    const key = JSON.stringify([
      take.pieceId,
      take.trackName,
      take.range.start,
      take.range.end,
      take.tempo,
      take.transpose ?? 0,
      take.rubric,
    ]);
    comparable.set(key, (comparable.get(key) ?? 0) + 1);
  }
  return [
    {
      id: 'first',
      title: 'Showed up',
      detail: 'Save your first real take.',
      earned: real.length > 0,
    },
    {
      id: 'return',
      title: 'Came back',
      detail: 'Save takes on two different days.',
      earned: days.size >= 2,
    },
    {
      id: 'repeat',
      title: 'Found it twice',
      detail:
        'Two complete takes of the same passage, part, key and tempo, each with 90% notes, timing and coverage.',
      earned: [...comparable.values()].some((count) => count >= 2),
    },
  ];
}
