import { emptyGym, rhythmLabels, articulationLabels, patternLabels } from './gym';
import type { Exercise, GymData, GymRoutine, GymSet } from './gym';
import { scales } from '../music/exerciseCatalog';
import { parseExerciseNotes } from '../music/exercisePatterns';
import { validateOuterLoop, validateTransform } from './gymPlan';
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') throw new Error('Invalid gym data.');
  return value as Record<string, unknown>;
};
const whole = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
export function validateExercise(value: unknown): Exercise {
  const e = object(value),
    source = object(e.source),
    defaults = object(e.defaults);
  if (
    typeof e.id !== 'string' ||
    !e.id ||
    typeof e.title !== 'string' ||
    !e.title.trim() ||
    e.title.length > 100
  )
    throw new Error('Give the exercise a name of up to 100 characters.');
  if (!['guitar', 'bass'].includes(String(e.instrument))) throw new Error('Choose guitar or bass.');
  if (!whole(source.key, 0, 11)) throw new Error('Choose a valid key.');
  if (source.kind === 'scale') {
    if (
      !scales.some((s) => s.id === source.scaleId) ||
      !(typeof source.octaves === 'number' && [0.5, 1, 2, 3].includes(source.octaves)) ||
      !['ascending', 'descending', 'up-down', 'down-up'].includes(String(source.direction)) ||
      !(String(source.pattern) in patternLabels)
    )
      throw new Error('Choose valid scale, range, direction and pattern settings.');
  } else if (source.kind === 'notes') {
    if (typeof source.notes !== 'string') throw new Error('Enter some notes.');
    if (!parseExerciseNotes(source.notes).some((note) => note !== null))
      throw new Error('Include at least one pitched note.');
  } else if (source.kind === 'score') {
    if (
      typeof source.snapshotId !== 'string' ||
      !whole(source.track, 0, 127) ||
      !whole(source.startBar, 1, 2000) ||
      !whole(source.endBar, 1, 2000) ||
      Number(source.endBar) < Number(source.startBar) ||
      Number(source.endBar) - Number(source.startBar) >= 64
    )
      throw new Error('Choose a part and up to 64 consecutive bars.');
  } else throw new Error('Choose an exercise source.');
  if (
    !whole(defaults.tempo, 30, 240) ||
    !(String(defaults.rhythm) in rhythmLabels) ||
    !(String(defaults.articulation) in articulationLabels)
  )
    throw new Error('Choose valid tempo, rhythm and articulation settings.');
  return {
    ...e,
    title: e.title.trim(),
    description: typeof e.description === 'string' ? e.description.slice(0, 1000) : '',
    revision: whole(e.revision, 1, 100000) ? e.revision : 1,
  } as unknown as Exercise;
}
export function validateRoutine(value: unknown): GymRoutine {
  const r = object(value);
  if (
    typeof r.id !== 'string' ||
    typeof r.title !== 'string' ||
    !r.title.trim() ||
    r.title.length > 100 ||
    !Array.isArray(r.blocks) ||
    !r.blocks.length ||
    r.blocks.length > 40
  )
    throw new Error('Name the routine and add between 1 and 40 exercise blocks.');
  const ids = new Set<string>();
  validateOuterLoop(r.outerLoop as GymRoutine['outerLoop']);
  for (const value of r.blocks) {
    const b = object(value);
    if (typeof b.id !== 'string' || ids.has(b.id) || typeof b.exerciseId !== 'string')
      throw new Error('Invalid routine block.');
    ids.add(b.id);
    validateTransform(b.transform as GymRoutine['blocks'][number]['transform']);
  }
  return {
    ...r,
    title: r.title.trim(),
    description: typeof r.description === 'string' ? r.description.slice(0, 1000) : '',
  } as unknown as GymRoutine;
}
function validSet(value: unknown): value is GymSet {
  try {
    const s = object(value);
    validateExercise(s.exercise);
    return (
      typeof s.id === 'string' &&
      whole(s.tempo, 30, 240) &&
      whole(s.keyOffset, -12, 12) &&
      String(s.rhythm) in rhythmLabels &&
      String(s.articulation) in articulationLabels
    );
  } catch {
    return false;
  }
}
export function restoreGym(value: unknown): GymData {
  const clean = emptyGym();
  if (!value || typeof value !== 'object') return clean;
  const data = value as Partial<GymData>;
  if (data.schema !== 1) return clean;
  if (data.earnedBadges && typeof data.earnedBadges === 'object')
    clean.earnedBadges = Object.fromEntries(
      Object.entries(data.earnedBadges).filter(
        ([, date]) => typeof date === 'string' && Number.isFinite(Date.parse(date)),
      ),
    );
  for (const e of Array.isArray(data.exercises) ? data.exercises : [])
    try {
      const entry = validateExercise(e);
      if (!clean.exercises.some((x) => x.id === entry.id))
        clean.exercises.push({ ...entry, builtin: false });
    } catch {
      /* Retain the other valid entries. */
    }
  for (const r of Array.isArray(data.routines) ? data.routines : [])
    try {
      const entry = validateRoutine(r);
      if (!clean.routines.some((x) => x.id === entry.id))
        clean.routines.push({ ...entry, builtin: false });
    } catch {
      /* Retain the other valid entries. */
    }
  const ids = new Set<string>();
  clean.attempts = (Array.isArray(data.attempts) ? data.attempts : []).filter((a) => {
    if (
      !a ||
      typeof a.id !== 'string' ||
      ids.has(a.id) ||
      typeof a.exerciseId !== 'string' ||
      typeof a.profile !== 'string' ||
      !Number.isFinite(Date.parse(a.createdAt)) ||
      !whole(a.tempo, 30, 240) ||
      !Number.isFinite(a.seconds) ||
      a.seconds < 0
    )
      return false;
    ids.add(a.id);
    return (
      [a.notes, a.timing, a.score].every(
        (n) => n === null || (typeof n === 'number' && n >= 0 && n <= 100),
      ) &&
      a.coverage >= 0 &&
      a.coverage <= 100 &&
      (a.timingCoverage === undefined ||
        (Number.isFinite(a.timingCoverage) && a.timingCoverage >= 0 && a.timingCoverage <= 100))
    );
  });
  const activityIds = new Set<string>();
  clean.activities = (Array.isArray(data.activities) ? data.activities : []).filter((a) => {
    if (
      !a ||
      typeof a.id !== 'string' ||
      activityIds.has(a.id) ||
      !Number.isFinite(a.seconds) ||
      a.seconds <= 0 ||
      a.seconds > 7200 ||
      !Number.isFinite(Date.parse(a.createdAt)) ||
      !['record', 'along'].includes(a.kind)
    )
      return false;
    activityIds.add(a.id);
    return true;
  });
  clean.completedRuns = (Array.isArray(data.completedRuns) ? data.completedRuns : []).filter(
    (r) =>
      r &&
      typeof r.id === 'string' &&
      Number.isFinite(Date.parse(r.completedAt)) &&
      whole(r.sets, 1, 240) &&
      whole(r.completed, 0, r.sets) &&
      whole(r.skipped, 0, r.sets),
  );
  const run = data.run;
  if (
    run &&
    typeof run.id === 'string' &&
    Array.isArray(run.queue) &&
    run.queue.length > 0 &&
    run.queue.length <= 240 &&
    run.queue.every(validSet) &&
    whole(run.index, 0, run.queue.length - 1) &&
    Array.isArray(run.completedSets) &&
    Array.isArray(run.skippedSets)
  )
    clean.run = {
      ...run,
      status: run.status === 'completed' ? 'completed' : 'paused',
      restUntil: Number.isFinite(run.restUntil) ? run.restUntil : 0,
    };
  clean.dailyGoalMinutes = whole(data.dailyGoalMinutes, 5, 120) ? data.dailyGoalMinutes! : 15;
  return clean;
}
