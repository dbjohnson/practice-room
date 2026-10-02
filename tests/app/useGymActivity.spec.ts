// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGymActivity } from '../../src/app/useGymActivity';
import { starterExercises } from '../../src/music/exerciseCatalog';
import { exerciseSet } from '../../src/domain/gymPlan';
import type { useGymStore } from '../../src/app/useGymStore';
const set = exerciseSet(starterExercises[0]);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('active gym time', () => {
  it('credits full native loop passes even when display frames are delayed', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const recordActivity = vi.fn();
    const store = { recordActivity } as unknown as ReturnType<typeof useGymStore>;
    const options = { store, run: null, set, playing: true, tick: 0, totalTicks: 7680, tempo: 60 };
    const { result, rerender } = renderHook((props) => useGymActivity(props), {
      initialProps: options,
    });
    now = 17500;
    act(() => {
      result.current.finishLoop(8);
      result.current.finishLoop(16);
    });
    expect(
      recordActivity.mock.calls.map(([activity]) => [activity.seconds, activity.completed]),
    ).toEqual([
      [8, true],
      [8, true],
    ]);
    rerender({ ...options, tick: 1440 });
    rerender({ ...options, playing: false, tick: 1440 });
    expect(recordActivity.mock.calls[2][0]).toMatchObject({ seconds: 1.5, completed: false });
    rerender({ ...options, playing: false });
    act(() => result.current.finishLoop(24));
    expect(recordActivity).toHaveBeenCalledTimes(3);
  });
  it('counts only actual playback progression and never marks a paused set complete', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const recordActivity = vi.fn(),
      store = { recordActivity } as unknown as ReturnType<typeof useGymStore>;
    const options = { store, run: null, set, playing: false, tick: 0, totalTicks: 7680, tempo: 60 };
    const { rerender } = renderHook((props) => useGymActivity(props), { initialProps: options });
    now = 10000;
    rerender({ ...options, playing: true });
    now = 20000;
    rerender({ ...options, playing: true, tick: 1920 });
    rerender({ ...options, tick: 1920 });
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity.mock.calls[0][0]).toMatchObject({
      seconds: 2,
      completed: false,
      kind: 'along',
    });
  });
  it('requires a player-finished event from the start of a set for completion', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const recordActivity = vi.fn(),
      store = { recordActivity } as unknown as ReturnType<typeof useGymStore>;
    const options = { store, run: null, set, playing: true, tick: 0, totalTicks: 7680, tempo: 60 };
    const { result, rerender } = renderHook((props) => useGymActivity(props), {
      initialProps: options,
    });
    now = 8000;
    act(() => result.current.finish());
    expect(recordActivity.mock.calls[0][0]).toMatchObject({ seconds: 8, completed: true });
    rerender({ ...options, playing: false });
    expect(recordActivity).toHaveBeenCalledTimes(1);
    rerender({ ...options, tick: 3840 });
    now = 12000;
    act(() => result.current.finish());
    expect(recordActivity.mock.calls[1][0]).toMatchObject({ seconds: 4, completed: false });
  });
});
