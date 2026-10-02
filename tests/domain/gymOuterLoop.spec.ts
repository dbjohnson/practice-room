import { expect, it } from 'vitest';
import { defaultTransform, emptyGym, type GymRoutine } from '../../src/domain/gym';
import { expandRoutine, routineLayout, setKey } from '../../src/domain/gymPlan';
import { restoreGym, validateRoutine } from '../../src/domain/gymValidation';
import { routineLibraryRows } from '../../src/domain/gymLibrary';
import { starterExercises } from '../../src/music/exerciseCatalog';
import { createExerciseScore } from '../../src/music/exerciseScore';
import { exercisePitches } from '../../src/music/exercisePatterns';
import { expectedNotes } from '../../src/music/scoreTimeline';

const exercises = starterExercises.slice(0, 2);
const routine: GymRoutine = {
  id: 'outer',
  title: 'Whole routine',
  description: '',
  createdAt: '',
  updatedAt: '',
  blocks: exercises.map((e, i) => ({
    id: `block-${i}`,
    exerciseId: e.id,
    transform: {
      ...defaultTransform(100 + i * 20),
      endBpm: 104 + i * 20,
      keyOrder: 'fourths',
      keyCount: 4,
      repetitions: i === 0 ? 2 : 1,
      rhythm: 'triplets',
      articulation: 'staccato',
      restSeconds: 3,
      requirePass: true,
    },
  })),
  outerLoop: {
    tempo: { startBpm: 80, endBpm: 90, bpmStep: 8 },
    keys: { keyOrder: 'fifths', keyCount: 3 },
  },
};

it('completes every block at each key before advancing tempo, preserving repetitions and block settings', () => {
  const queue = expandRoutine(routine, exercises);
  expect(queue).toHaveLength(27);
  expect(queue.slice(0, 9).map((s) => [s.blockId, s.tempo, setKey(s), s.repetition])).toEqual([
    ['block-0', 80, 0, 1],
    ['block-0', 80, 0, 2],
    ['block-1', 80, 2, 1],
    ['block-0', 80, 7, 1],
    ['block-0', 80, 7, 2],
    ['block-1', 80, 9, 1],
    ['block-0', 80, 2, 1],
    ['block-0', 80, 2, 2],
    ['block-1', 80, 4, 1],
  ]);
  expect(queue[9]).toMatchObject({ tempo: 88, keyOffset: 0, routinePass: { number: 4, total: 9 } });
  expect(queue.at(-1)).toMatchObject({
    tempo: 90,
    keyOffset: 2,
    routinePass: { number: 9, total: 9 },
  });
  expect(
    queue.every(
      (s) =>
        s.rhythm === 'triplets' &&
        s.articulation === 'staccato' &&
        s.restSeconds === 3 &&
        s.requirePass,
    ),
  ).toBe(true);
  expect(new Set(queue.map((s) => s.id)).size).toBe(queue.length);
  queue[0].exercise.title = 'Changed';
  expect(queue[1].exercise.title).toBe(exercises[0].title);
});

it('allows either outer dimension independently and leaves the other block dimension intact', () => {
  const tempoOnly = expandRoutine(
    { ...routine, outerLoop: { tempo: routine.outerLoop!.tempo } },
    exercises,
  );
  expect(tempoOnly).toHaveLength(36);
  expect(tempoOnly.slice(0, 8).map((s) => s.keyOffset)).toEqual([0, 0, 5, 5, 10, 10, 3, 3]);
  expect(tempoOnly.slice(0, 12).every((s) => s.tempo === 80)).toBe(true);
  const keysOnly = expandRoutine(
    { ...routine, outerLoop: { keys: routine.outerLoop!.keys } },
    exercises,
  );
  expect(keysOnly).toHaveLength(18);
  expect(keysOnly.slice(0, 6).map((s) => [s.tempo, s.keyOffset])).toEqual([
    [100, 0],
    [100, 0],
    [104, 0],
    [104, 0],
    [120, 0],
    [124, 0],
  ]);
  expect(keysOnly.slice(6, 12).every((s) => s.keyOffset === 7)).toBe(true);
});

it('keeps legacy queues and IDs unchanged when outer loops are disabled', () => {
  const legacy = expandRoutine({ ...routine, outerLoop: undefined }, exercises);
  const disabled = expandRoutine({ ...routine, outerLoop: {} }, exercises);
  expect(disabled).toEqual(legacy);
  expect(legacy[0].id).toBe('block-0:100:0:1');
  expect(legacy[0].routinePass).toBeUndefined();
  expect(legacy).toHaveLength(24);
});

it('keeps summaries consistent with queue sizes and the effective tempo range', () => {
  for (const outerLoop of [routine.outerLoop, { keys: routine.outerLoop!.keys }, {}]) {
    const r = { ...routine, outerLoop };
    const queue = expandRoutine(r, exercises);
    const [row] = routineLibraryRows([r], exercises);
    expect(row.sets).toBe(queue.length);
    expect(row.tempo).toBe(Math.min(...queue.map((s) => s.tempo)));
    expect(row.tempoLabel).toBe(
      `${Math.min(...queue.map((s) => s.tempo))}–${Math.max(...queue.map((s) => s.tempo))}`,
    );
  }
});

it('persists routine settings and resumes the exact pass snapshot after reload', () => {
  const queue = expandRoutine(routine, exercises);
  const saved = restoreGym({
    ...emptyGym(),
    routines: [routine],
    run: {
      id: 'run',
      title: routine.title,
      queue,
      index: 10,
      status: 'active',
      startedAt: '',
      restUntil: 0,
      completedSets: [],
      skippedSets: [],
    },
  });
  expect(saved.routines[0].outerLoop).toEqual(routine.outerLoop);
  expect(saved.run).toMatchObject({ index: 10, status: 'paused' });
  expect(saved.run!.queue[10]).toEqual(queue[10]);
});

it('rejects malformed outer settings and bounds the multiplied workout before creating snapshots', () => {
  for (const outerLoop of [
    null,
    { tempo: null },
    { tempo: { startBpm: 90, endBpm: 80, bpmStep: 4 } },
    { keys: { keyOrder: 'bad', keyCount: 3 } },
  ]) {
    expect(() => validateRoutine({ ...routine, outerLoop })).toThrow();
    expect(restoreGym({ ...emptyGym(), routines: [{ ...routine, outerLoop }] }).routines).toEqual(
      [],
    );
  }
  const excessive = {
    ...routine,
    outerLoop: {
      tempo: { startBpm: 30, endBpm: 240, bpmStep: 1 },
      keys: { keyOrder: 'fifths' as const, keyCount: 12 },
    },
  };
  expect(() => routineLayout(excessive)).toThrow('240 sets');
  expect(() => expandRoutine(excessive, exercises)).toThrow('240 sets');
  expect(routineLibraryRows([excessive], exercises)[0].sets).toBe(0);
});

it('applies each pass to the actual score and assessment pitches for every exercise', () => {
  const queue = expandRoutine(routine, exercises);
  for (const set of [queue[3], queue[5], queue[18], queue[20]]) {
    const { score } = createExerciseScore(set.exercise, set);
    const notes = expectedNotes(score, 0, { start: 1, end: score.masterBars.length });
    expect(notes.map((n) => n.midi)).toEqual(
      exercisePitches(set.exercise).map((n) => n! + set.keyOffset),
    );
    expect(score.tempo).toBe(set.tempo);
  }
});
