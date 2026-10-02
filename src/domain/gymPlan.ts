import type { Exercise, GymRoutine, GymSet, RoutineOuterLoop, WorkoutTransform } from './gym';
import { defaultTransform, rhythmLabels, articulationLabels } from './gym';
export const MAX_GYM_SETS = 240;
const integer = (value: number, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
};
export function validateTransform(t: WorkoutTransform) {
  integer(t.startBpm, 30, 240, 'Starting tempo');
  integer(t.endBpm, 30, 240, 'Target tempo');
  integer(t.bpmStep, 1, 40, 'Tempo step');
  integer(t.repetitions, 1, 20, 'Repetitions');
  integer(t.keyCount, 1, 12, 'Key count');
  integer(t.restSeconds, 0, 120, 'Rest');
  integer(t.target, 50, 100, 'Score target');
  if (t.endBpm < t.startBpm)
    throw new Error('The target tempo must be at least the starting tempo.');
  if (!['fixed', 'fifths', 'fourths', 'chromatic'].includes(t.keyOrder))
    throw new Error('Choose a key order.');
  if (t.rhythm !== 'exercise' && !(t.rhythm in rhythmLabels))
    throw new Error('Choose a rhythm pattern.');
  if (t.articulation !== 'exercise' && !(t.articulation in articulationLabels))
    throw new Error('Choose an articulation pattern.');
}
export function tempoLadder(start: number, end: number, step: number) {
  integer(start, 30, 240, 'Starting tempo');
  integer(end, 30, 240, 'Target tempo');
  integer(step, 1, 40, 'Tempo step');
  if (end < start) throw new Error('The target tempo must be at least the starting tempo.');
  const values: number[] = [];
  for (let tempo = start; tempo < end; tempo += step) values.push(tempo);
  values.push(end);
  return values;
}
function keyOffsets(t: Pick<WorkoutTransform, 'keyOrder' | 'keyCount'>) {
  integer(t.keyCount, 1, 12, 'Key count');
  if (!['fixed', 'fifths', 'fourths', 'chromatic'].includes(t.keyOrder))
    throw new Error('Choose a key order.');
  const interval = { fixed: 0, fifths: 7, fourths: 5, chromatic: 1 }[t.keyOrder];
  return Array.from(
    { length: t.keyOrder === 'fixed' ? 1 : t.keyCount },
    (_, i) => (i * interval) % 12,
  );
}
export function validateOuterLoop(loop?: RoutineOuterLoop) {
  if (loop === undefined) return;
  if (!loop || typeof loop !== 'object') throw new Error('Invalid routine outer loop.');
  if (loop.tempo !== undefined) {
    if (!loop.tempo || typeof loop.tempo !== 'object')
      throw new Error('Invalid routine tempo ladder.');
    tempoLadder(loop.tempo.startBpm, loop.tempo.endBpm, loop.tempo.bpmStep);
  }
  if (loop.keys !== undefined) {
    if (!loop.keys || typeof loop.keys !== 'object')
      throw new Error('Invalid routine key modulation.');
    keyOffsets(loop.keys);
  }
}
// Shared by queue generation and table summaries; no exercise snapshots are
// cloned until the entire plan has passed its size and settings checks.
export function routineLayout(routine: GymRoutine) {
  if (!routine.blocks.length) throw new Error('Add at least one exercise to the routine.');
  validateOuterLoop(routine.outerLoop);
  const outer = routine.outerLoop;
  const tempos: (number | undefined)[] = outer?.tempo
    ? tempoLadder(outer.tempo.startBpm, outer.tempo.endBpm, outer.tempo.bpmStep)
    : [undefined];
  const keys: (number | undefined)[] = outer?.keys ? keyOffsets(outer.keys) : [undefined];
  const blocks = routine.blocks.map((block) => {
    const t = block.transform;
    validateTransform(t);
    return {
      block,
      tempos: outer?.tempo ? [outer.tempo.startBpm] : tempoLadder(t.startBpm, t.endBpm, t.bpmStep),
      keys: outer?.keys ? [0] : keyOffsets(t),
    };
  });
  const count =
    tempos.length *
    keys.length *
    blocks.reduce(
      (sum, b) => sum + b.tempos.length * b.keys.length * b.block.transform.repetitions,
      0,
    );
  if (count > MAX_GYM_SETS)
    throw new Error(
      `Keep a workout to ${MAX_GYM_SETS} sets or fewer. Reduce keys, repetitions or tempo steps.`,
    );
  const passes = tempos.flatMap((tempo) => keys.map((keyOffset) => ({ tempo, keyOffset })));
  const allTempos = outer?.tempo ? (tempos as number[]) : blocks.flatMap((b) => b.tempos);
  return {
    blocks,
    passes,
    count,
    lowTempo: Math.min(...allTempos),
    highTempo: Math.max(...allTempos),
    hasOuterLoop: !!(outer?.tempo || outer?.keys),
  };
}
export function expandRoutine(routine: GymRoutine, exercises: Exercise[]): GymSet[] {
  const layout = routineLayout(routine);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  if (routine.blocks.some((b) => !byId.has(b.exerciseId)))
    throw new Error('An exercise in this routine is missing. Edit the routine to replace it.');
  const queue: GymSet[] = [];
  for (const [index, pass] of layout.passes.entries())
    for (const { block, tempos, keys } of layout.blocks) {
      const exercise = byId.get(block.exerciseId)!;
      const t = block.transform;
      for (const blockTempo of tempos)
        for (const [keyIndex, blockKey] of keys.entries())
          for (let rep = 1; rep <= t.repetitions; rep++) {
            const tempo = pass.tempo ?? blockTempo;
            queue.push({
              id: `${layout.hasOuterLoop ? `pass:${index + 1}:` : ''}${block.id}:${tempo}:${keyIndex}:${rep}`,
              blockId: block.id,
              exercise: structuredClone(exercise),
              tempo,
              keyOffset: pass.keyOffset ?? blockKey,
              rhythm: t.rhythm === 'exercise' ? exercise.defaults.rhythm : t.rhythm,
              articulation:
                t.articulation === 'exercise' ? exercise.defaults.articulation : t.articulation,
              repetition: rep,
              restSeconds: t.restSeconds,
              target: t.target,
              requirePass: t.requirePass,
              ...(layout.hasOuterLoop
                ? { routinePass: { number: index + 1, total: layout.passes.length } }
                : {}),
            });
          }
    }
  return queue;
}
export function exerciseSet(exercise: Exercise): GymSet {
  return expandRoutine(
    {
      id: 'single',
      title: exercise.title,
      description: '',
      blocks: [
        {
          id: 'single',
          exerciseId: exercise.id,
          transform: { ...defaultTransform(exercise.defaults.tempo), restSeconds: 0 },
        },
      ],
      createdAt: '',
      updatedAt: '',
    },
    [exercise],
  )[0];
}
export const setKey = (set: GymSet) => (((set.exercise.source.key + set.keyOffset) % 12) + 12) % 12;
export const comparisonProfile = (set: GymSet) =>
  JSON.stringify([
    set.exercise.id,
    set.exercise.revision,
    set.exercise.instrument,
    setKey(set),
    set.keyOffset,
    set.rhythm,
    set.articulation,
  ]);
