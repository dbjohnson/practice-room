import type { GymData, GymRun } from './gym';
import { passesSet } from './gymRewards';
export function canFinishSet(data: GymData, run: GymRun) {
  const set = run.queue[run.index];
  const attempts = data.attempts.filter((a) => a.runId === run.id && a.setId === set.id);
  if (set.requirePass) return attempts.some((a) => passesSet(a, set));
  return (
    attempts.some((a) => !a.interrupted) ||
    data.activities.some((a) => a.runId === run.id && a.setId === set.id && a.completed === true)
  );
}
export function advanceGym(data: GymData, skip = false, now = Date.now()): GymData {
  const run = data.run;
  if (!run || run.status !== 'active') return data;
  const set = run.queue[run.index];
  if (!skip && !canFinishSet(data, run))
    throw new Error(
      set.requirePass
        ? `Reach ${set.target}% in both notes and timing with 90% coverage, or skip this set.`
        : 'Finish a take or play along through this set before continuing, or use Skip.',
    );
  const completedSets = skip ? run.completedSets : [...new Set([...run.completedSets, set.id])];
  const skippedSets = skip ? [...new Set([...run.skippedSets, set.id])] : run.skippedSets;
  const last = run.index === run.queue.length - 1;
  const next: GymRun = {
    ...run,
    completedSets,
    skippedSets,
    index: last ? run.index : run.index + 1,
    status: last ? 'completed' : 'active',
    restUntil: last ? 0 : now + set.restSeconds * 1000,
    completedAt: last ? new Date(now).toISOString() : undefined,
  };
  return {
    ...data,
    run: next,
    completedRuns: last
      ? [
          ...data.completedRuns.filter((r) => r.id !== run.id),
          {
            id: run.id,
            routineId: run.routineId,
            title: run.title,
            completedAt: next.completedAt!,
            sets: run.queue.length,
            completed: completedSets.length,
            skipped: skippedSets.length,
          },
        ]
      : data.completedRuns,
  };
}
