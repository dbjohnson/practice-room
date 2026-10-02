import { useEffect, useRef, useState } from 'react';
import type { GymRoutine, GymRun, GymSet } from '../domain/gym';
import { expandRoutine } from '../domain/gymPlan';
import { advanceGym, canFinishSet } from '../domain/gymRun';
import type { useGymStore } from './useGymStore';

type Store = ReturnType<typeof useGymStore>;
export function useGymRunner(
  store: Store,
  open: (set: GymSet) => Promise<boolean>,
  halt: () => void,
  notify: (message: string) => void,
) {
  const latest = useRef({ store, open, halt, notify });
  latest.current = { store, open, halt, notify };
  const [loading, setLoading] = useState(false),
    [now, setNow] = useState(Date.now);
  const generation = useRef(0);
  const run = store.data.run;
  const rest = run?.status === 'active' ? Math.max(0, Math.ceil((run.restUntil - now) / 1000)) : 0;
  useEffect(() => {
    if (!run || run.restUntil <= Date.now() || run.status !== 'active') return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [run?.restUntil, run?.status]);
  const load = async (next: GymRun) => {
    const token = ++generation.current;
    setLoading(true);
    latest.current.halt();
    try {
      const loaded = await latest.current.open(next.queue[next.index]);
      if (token !== generation.current) return;
      latest.current.store.commit((d) => ({
        ...d,
        run: { ...next, status: loaded ? 'active' : 'paused' },
      }));
      setNow(Date.now());
    } finally {
      if (token === generation.current) setLoading(false);
    }
  };
  const start = async (routine: GymRoutine) => {
    try {
      const queue = expandRoutine(routine, latest.current.store.exercises);
      await load({
        id: crypto.randomUUID(),
        routineId: routine.id,
        title: routine.title,
        queue,
        index: 0,
        status: 'active',
        startedAt: new Date().toISOString(),
        restUntil: 0,
        completedSets: [],
        skippedSets: [],
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not start this workout.');
    }
  };
  const pause = () => {
    generation.current++;
    setLoading(false);
    latest.current.halt();
    store.commit((d) => ({
      ...d,
      run: d.run && d.run.status !== 'completed' ? { ...d.run, status: 'paused' } : d.run,
    }));
  };
  const advance = async (skip = false) => {
    if (loading) return;
    try {
      latest.current.halt();
      const next = advanceGym(latest.current.store.current.current, skip);
      store.commit(() => next);
      if (next.run?.status === 'active') await load(next.run);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not advance the workout.');
    }
  };
  return {
    run,
    loading,
    rest,
    start,
    pause,
    advance,
    canAdvance: !!run && canFinishSet(store.data, run),
    resume: () => run && load({ ...run, restUntil: 0 }),
    retry: () => run && load({ ...run, restUntil: 0 }),
    skipRest: () => {
      setNow(Date.now());
      store.commit((d) => ({ ...d, run: d.run ? { ...d.run, restUntil: 0 } : null }));
    },
    close: () => {
      generation.current++;
      setLoading(false);
      latest.current.halt();
      store.commit((d) => ({ ...d, run: null }));
    },
  };
}
