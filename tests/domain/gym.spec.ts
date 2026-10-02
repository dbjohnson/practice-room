import { describe, expect, it } from 'vitest';
import {
  defaultTransform,
  emptyGym,
  type GymAttempt,
  type GymData,
  type GymRoutine,
} from '../../src/domain/gym';
import {
  expandRoutine,
  comparisonProfile,
  exerciseSet,
  tempoLadder,
  setKey,
} from '../../src/domain/gymPlan';
import { restoreGym, validateExercise } from '../../src/domain/gymValidation';
import {
  gymRewards,
  isPersonalBest,
  cleanAttempt,
  gymAttempt,
  passesSet,
} from '../../src/domain/gymRewards';
import { advanceGym } from '../../src/domain/gymRun';
import { starterExercises } from '../../src/music/exerciseCatalog';
import type { Take } from '../../src/domain/types';
const exercise = starterExercises[0];
it('requires sufficient timing evidence for rewards and separates the corrected scoring rubric', () => {
  expect(cleanAttempt(attempt({ timingCoverage: 20 }))).toBe(false);
  expect(passesSet(attempt({ timingCoverage: 20 }), exerciseSet(exercise))).toBe(false);
  const take: Take = {
    ...attempt(),
    origin: 'microphone',
    gym: { set: exerciseSet(exercise) },
    pieceId: exercise.id,
    pieceTitle: exercise.title,
    trackName: 'Guitar',
    notes: [],
    calibrated: true,
    rubric: 'mono-v2',
    timingMs: 0,
    range: { start: 1, end: 4 },
    duration: 12,
    pitchAccuracy: 100,
    timingScore: 100,
    overallScore: 100,
    timingCoverage: 100,
  };
  const old = gymAttempt({ ...take, rubric: 'mono-v2' })!;
  const current = gymAttempt({ ...take, rubric: 'mono-v3' })!;
  expect(current.profile).not.toBe(old.profile);
  expect(isPersonalBest({ ...current, tempo: 120, createdAt: '2026-10-02' }, [old])).toBe(false);
  expect(restoreGym({ ...emptyGym(), attempts: [current] }).attempts).toHaveLength(1);
  expect(
    restoreGym({ ...emptyGym(), attempts: [{ ...current, timingCoverage: 101 }] }).attempts,
  ).toHaveLength(0);
});
const routine: GymRoutine = {
  id: 'r',
  title: 'Test',
  description: '',
  createdAt: '',
  updatedAt: '',
  blocks: [
    {
      id: 'b',
      exerciseId: exercise.id,
      transform: {
        ...defaultTransform(),
        endBpm: 90,
        bpmStep: 8,
        keyOrder: 'fifths',
        keyCount: 3,
        repetitions: 2,
      },
    },
  ],
};
const attempt = (value: Partial<GymAttempt> = {}): GymAttempt => ({
  id: 'a',
  setId: 's',
  exerciseId: exercise.id,
  title: exercise.title,
  revision: 1,
  profile: comparisonProfile(exerciseSet(exercise)),
  key: 0,
  tempo: 80,
  rhythm: 'eighths',
  articulation: 'even',
  createdAt: '2026-09-30T12:00:00Z',
  seconds: 12,
  notes: 99,
  timing: 96,
  score: 98,
  coverage: 100,
  interrupted: false,
  ...value,
});
describe('gym plans and persistence', () => {
  it('expands exact tempo endpoints, keys and repetitions in a stable order', () => {
    expect(tempoLadder(80, 90, 8)).toEqual([80, 88, 90]);
    const queue = expandRoutine(routine, starterExercises);
    expect(queue).toHaveLength(18);
    expect(queue.slice(0, 6).map((s) => [s.tempo, setKey(s), s.repetition])).toEqual([
      [80, 0, 1],
      [80, 0, 2],
      [80, 7, 1],
      [80, 7, 2],
      [80, 2, 1],
      [80, 2, 2],
    ]);
    queue[0].exercise.title = 'changed';
    expect(exercise.title).toBe('Major scale');
    expect(() =>
      expandRoutine(
        {
          ...routine,
          blocks: [
            {
              ...routine.blocks[0],
              transform: {
                ...defaultTransform(),
                endBpm: 240,
                bpmStep: 1,
                keyOrder: 'chromatic',
                keyCount: 12,
              },
            },
          ],
        },
        starterExercises,
      ),
    ).toThrow('240 sets');
    expect(() => tempoLadder(90, 80, 4)).toThrow();
    expect(() => expandRoutine(routine, [])).toThrow('missing');
  });
  it('restores valid entries, rejects corrupt data, and pauses resumable workouts', () => {
    const data = emptyGym(),
      queue = expandRoutine(routine, starterExercises);
    data.exercises = [{ ...exercise, builtin: false }];
    data.run = {
      id: 'run',
      title: 'Saved',
      queue,
      index: 2,
      status: 'active',
      startedAt: '',
      restUntil: 0,
      completedSets: [],
      skippedSets: [],
    };
    expect(restoreGym(data).run).toMatchObject({ index: 2, status: 'paused' });
    expect(
      restoreGym({
        schema: 1,
        exercises: {},
        routines: 'bad',
        attempts: [attempt(), attempt(), null],
      }).attempts,
    ).toHaveLength(1);
    expect(restoreGym({ ...data, run: { ...data.run, index: 1000 } }).run).toBeNull();
    expect(() =>
      validateExercise({ ...exercise, source: { ...exercise.source, octaves: '3' } }),
    ).toThrow();
  });
  it('requires finished attempts or explicit skips and honors score gates', () => {
    const queue = [exerciseSet(exercise)];
    queue[0].requirePass = true;
    const data: GymData = {
      ...emptyGym(),
      run: {
        id: 'run',
        title: 'Workout',
        queue,
        index: 0,
        status: 'active',
        startedAt: '',
        restUntil: 0,
        completedSets: [],
        skippedSets: [],
      },
    };
    expect(() => advanceGym(data)).toThrow('Reach 95%');
    expect(advanceGym(data, true).completedRuns[0]).toMatchObject({ completed: 0, skipped: 1 });
    data.attempts = [attempt({ runId: 'run', setId: queue[0].id })];
    expect(advanceGym(data).completedRuns[0]).toMatchObject({ completed: 1, skipped: 0 });
    expect(advanceGym(advanceGym(data)).completedRuns).toHaveLength(1);
  });
});
describe('gym records and rewards', () => {
  it('requires clear, complete note AND timing accuracy for a clean-speed record', () => {
    const previous = attempt(),
      faster = attempt({ id: 'b', tempo: 88, createdAt: '2026-09-30T13:00:00Z' });
    expect(isPersonalBest(previous, [previous])).toBe(false);
    expect(isPersonalBest(faster, [previous, faster])).toBe(true);
    for (const change of [
      { timing: 94 },
      { notes: 94 },
      { coverage: 89 },
      { interrupted: true },
      { score: null, timing: null },
    ])
      expect(cleanAttempt(attempt(change))).toBe(false);
    expect(isPersonalBest({ ...faster, profile: 'other key' }, [previous])).toBe(false);
  });
  it('deduplicates saved takes and activities and retains earned streak badges after a break', () => {
    const data = emptyGym();
    data.attempts = [attempt(), attempt()];
    data.activities = [28, 29, 30].map((day) => ({
      id: String(day),
      exerciseId: exercise.id,
      createdAt: `2026-09-${day}T12:00:00`,
      seconds: 60,
      kind: 'along',
    }));
    data.activities.push(data.activities[0]);
    const rewards = gymRewards(data, new Date('2026-09-30T15:00:00'));
    expect(rewards.seconds).toBe(180);
    expect(rewards.streak).toBe(3);
    expect(rewards.xp).toBe(45);
    const later = gymRewards(data, new Date('2026-10-04T15:00:00'));
    expect(later.streak).toBe(0);
    expect(later.badges.find((b) => b.id === 'streak3')?.value).toBe(3);
  });
});

it('keeps yesterday’s streak while today’s first minute is still in progress', () => {
  const data = emptyGym();
  data.activities = [
    {
      id: 'yesterday',
      exerciseId: exercise.id,
      createdAt: '2026-09-29T12:00:00',
      seconds: 90,
      kind: 'along',
    },
    {
      id: 'today',
      exerciseId: exercise.id,
      createdAt: '2026-09-30T12:00:00',
      seconds: 20,
      kind: 'along',
    },
  ];
  expect(gymRewards(data, new Date('2026-09-30T13:00:00')).streak).toBe(1);
  data.activities[1].seconds = 60;
  expect(gymRewards(data, new Date('2026-09-30T13:00:00')).streak).toBe(2);
});
