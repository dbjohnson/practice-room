import { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyGym,
  type Exercise,
  type GymActivity,
  type GymData,
  type GymRoutine,
} from '../domain/gym';
import { restoreGym, validateExercise, validateRoutine } from '../domain/gymValidation';
import { gymAttempt, gymRewards } from '../domain/gymRewards';
import type { Take } from '../domain/types';
import { starterExercises, starterRoutines } from '../music/exerciseCatalog';
import { readGym, writeGym } from '../storage/gym';

export function useGymStore(notify: (message: string) => void) {
  const [data, setData] = useState(emptyGym);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(data),
    writes = useRef(Promise.resolve());
  const hydrated = useRef(false);
  useEffect(() => {
    let active = true;
    void readGym()
      .then((value) => {
        if (!active) return;
        current.current = restoreGym(value);
        setData(current.current);
        hydrated.current = true;
        setReady(true);
      })
      .catch(() => {
        if (active) setError('Could not read your gym library. Reload before making changes.');
      });
    return () => {
      active = false;
    };
  }, []);
  const persist = (next: GymData) => {
    writes.current = writes.current
      .catch(() => {})
      .then(() => writeGym(next))
      .then(() => setError(null))
      .catch(() =>
        setError(
          'Gym changes are kept for this session, but could not be saved to this browser. Free storage and retry.',
        ),
      );
  };
  const commit = (update: (data: GymData) => GymData) => {
    if (!hydrated.current) return;
    const next = update(current.current);
    if (next === current.current) return;
    const earnedBadges = { ...next.earnedBadges };
    for (const badge of gymRewards(next).badges)
      if (badge.value >= badge.target && !earnedBadges[badge.id])
        earnedBadges[badge.id] = new Date().toISOString();
    next.earnedBadges = earnedBadges;
    current.current = next;
    setData(next);
    persist(next);
  };
  const exercises = useMemo(() => [...starterExercises, ...data.exercises], [data.exercises]);
  const routines = useMemo(() => [...starterRoutines, ...data.routines], [data.routines]);
  const saveExercise = (value: Exercise) => {
    const exercise = validateExercise(value);
    const previous = current.current.exercises.find((e) => e.id === exercise.id);
    exercise.revision = previous
      ? previous.revision +
        Number(
          previous.instrument !== exercise.instrument ||
            JSON.stringify(previous.source) !== JSON.stringify(exercise.source),
        )
      : 1;
    commit((d) => ({
      ...d,
      exercises: [exercise, ...d.exercises.filter((e) => e.id !== exercise.id)],
    }));
    return exercise;
  };
  const saveRoutine = (value: GymRoutine) => {
    const routine = validateRoutine(value);
    commit((d) => ({
      ...d,
      routines: [routine, ...d.routines.filter((r) => r.id !== routine.id)],
    }));
    return routine;
  };
  const removeExercise = (id: string) => {
    if (routines.some((r) => r.blocks.some((b) => b.exerciseId === id))) {
      notify('Remove this exercise from its routines before deleting it.');
      return;
    }
    commit((d) => ({ ...d, exercises: d.exercises.filter((e) => e.id !== id) }));
  };
  const recordTake = (take: Take) => {
    const attempt = gymAttempt(take);
    if (!attempt) return;
    commit((d) => {
      if (d.attempts.some((a) => a.id === attempt.id)) return d;
      const next = {
        ...d,
        attempts: [...d.attempts, attempt],
        activities:
          attempt.seconds > 0
            ? [
                ...d.activities,
                {
                  id: attempt.id,
                  exerciseId: attempt.exerciseId,
                  runId: attempt.runId,
                  createdAt: attempt.createdAt,
                  seconds: attempt.seconds,
                  kind: 'record' as const,
                },
              ]
            : d.activities,
      };
      const before = gymRewards(d),
        after = gymRewards(next);
      attempt.earnedXp = after.xp - before.xp;
      attempt.earnedBadges = after.badges
        .filter(
          (b) =>
            b.value >= b.target &&
            !before.badges.some((old) => old.id === b.id && old.value >= old.target),
        )
        .map((b) => b.id);
      return next;
    });
  };
  const recordActivity = (activity: GymActivity) => {
    if (activity.seconds <= 0) return;
    commit((d) =>
      d.activities.some((a) => a.id === activity.id)
        ? d
        : { ...d, activities: [...d.activities, activity] },
    );
  };
  return {
    data,
    ready,
    error,
    exercises,
    routines,
    commit,
    saveExercise,
    saveRoutine,
    removeExercise,
    recordTake,
    recordActivity,
    retrySave: () => {
      if (hydrated.current) persist(current.current);
      else window.location.reload();
    },
    removeRoutine: (id: string) =>
      commit((d) => ({ ...d, routines: d.routines.filter((r) => r.id !== id) })),
    current,
  };
}
