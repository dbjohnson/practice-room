import { useEffect, useRef } from 'react';
import type { GymRun, GymSet } from '../domain/gym';
import type { useGymStore } from './useGymStore';

export function useGymActivity(options: {
  store: ReturnType<typeof useGymStore>;
  run: GymRun | null;
  set?: GymSet;
  playing: boolean;
  tick: number;
  totalTicks: number;
  tempo: number;
}) {
  const latest = useRef(options);
  latest.current = options;
  const capture = useRef<{
    started: number;
    tick: number;
    maxTick: number;
    totalTicks: number;
    set: GymSet;
    run: GymRun | null;
    tempo: number;
  } | null>(null);
  const flush = (completed: boolean) => {
    const previous = capture.current;
    if (!previous) return;
    capture.current = null;
    const playedSeconds =
      ((((completed ? previous.totalTicks : previous.maxTick) - previous.tick) / 960) * 60) /
      previous.tempo;
    const seconds = Math.min(
      7200,
      Math.max(0, (performance.now() - previous.started) / 1000),
      Math.max(0, playedSeconds),
    );
    latest.current.store.recordActivity({
      id: crypto.randomUUID(),
      setId: previous.set.id,
      completed: completed && previous.tick <= 240,
      exerciseId: previous.set.exercise.id,
      runId: previous.run?.id,
      createdAt: new Date().toISOString(),
      seconds,
      kind: 'along',
    });
  };
  useEffect(() => {
    const o = latest.current,
      previous = capture.current;
    if (previous && (!o.playing || o.set?.id !== previous.set.id || o.run?.id !== previous.run?.id))
      flush(false);
    if (o.playing && o.set && o.tick >= 0) {
      capture.current ??= {
        started: performance.now(),
        tick: o.tick,
        maxTick: o.tick,
        totalTicks: o.totalTicks,
        set: o.set,
        run: o.run,
        tempo: o.tempo,
      };
      capture.current.maxTick = Math.max(capture.current.maxTick, o.tick);
    }
  }, [options.playing, options.tick, options.set?.id, options.run?.id]);
  const finishLoop = (ended: number) => {
    const o = latest.current;
    if (!o.playing || !o.set) return;
    // Native audio completed this full pass even when display frames arrived late.
    o.store.recordActivity({
      id: crypto.randomUUID(),
      setId: o.set.id,
      exerciseId: o.set.exercise.id,
      runId: o.run?.id,
      createdAt: new Date().toISOString(),
      seconds: Math.min(7200, ((o.totalTicks / 960) * 60) / o.tempo),
      completed: true,
      kind: 'along',
    });
    capture.current = {
      started: ended * 1000,
      tick: 0,
      maxTick: 0,
      totalTicks: o.totalTicks,
      set: o.set,
      run: o.run,
      tempo: o.tempo,
    };
  };
  return { finish: () => flush(true), finishLoop };
}
