// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTakes } from '../../src/app/useTakes';
import { loadTakes } from '../../src/storage/library';
import { takeFixture } from './takeFixture';

declare const jsdom: { window: Window };
let now = 0;
beforeEach(() => {
  now = 10;
  // Node also exposes localStorage; use the isolated browser store for these hooks.
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const fixture = takeFixture();
  const hook = renderHook(() => useTakes(fixture.options), { reactStrictMode: true });
  const observe = (time: number, midi = fixture.notes[0].midi) =>
    hook.result.current.onObservation({ time, midi, confidence: 0.99, rms: 0.2 });
  return { ...fixture, ...hook, observe };
}

describe('recording lifecycle', () => {
  it('requires a ready player and a valid passage before recording', () => {
    const { result, player, options } = setup();
    player.isReadyForPlayback = false;
    act(() => expect(result.current.begin()).toBe(false));
    player.isReadyForPlayback = true;
    options.range.end = 999;
    act(() => expect(result.current.begin()).toBe(false));
    expect(result.current.recording).toBe(false);
    expect(player.stop).not.toHaveBeenCalled();
  });

  it('stops during count-in without grading notes or saving progress', () => {
    const { result, player, startTick, observe } = setup();
    act(() => expect(result.current.begin()).toBe(true));
    expect(player.tickPosition).toBe(startTick);
    act(() => {
      observe(11);
      now = 12;
      result.current.finish();
    });
    expect(result.current.recording).toBe(false);
    expect(result.current.review).toMatchObject({
      duration: 0,
      interrupted: true,
      notes: [],
      pitchAccuracy: null,
      timingMs: null,
    });
    expect(loadTakes()).toEqual([]);
  });

  it('retains an opening attack delivered before the first playback position', () => {
    const { result, startTick, observe } = setup();
    act(() => {
      result.current.begin();
      now = 14.02;
      observe(14.01);
      now = 14.1;
      result.current.onPosition(startTick + 96, 60);
      now = 14.2;
      result.current.finish();
    });
    expect(result.current.review?.notes).toMatchObject([{ status: 'matched', delta: 10 }]);
    expect(result.current.review?.duration).toBeCloseTo(0.2);
  });

  it('excludes count-in attacks even when their pitch arrives after playback starts', () => {
    const { result, startTick, observe } = setup();
    act(() => {
      result.current.begin();
      now = 14;
      result.current.onPosition(startTick, 60);
      observe(13.9);
      observe(12);
      now = 18;
      result.current.finish(true);
    });
    expect(result.current.review?.notes.every((note) => note.status === 'unclear')).toBe(true);
    expect(result.current.review).toMatchObject({
      duration: 4,
      interrupted: false,
      pitchAccuracy: null,
    });
  });

  it('grades only the reached portion and keeps the settings used for that take', () => {
    const { result, startTick, observe, options, rerender } = setup();
    act(() => {
      result.current.begin();
      now = 14;
      result.current.onPosition(startTick, 60);
      observe(14.025);
      now = 14.5;
      result.current.onPosition(startTick + 480, 60);
    });
    options.tempo = 120;
    options.range = { start: 3, end: 4 };
    rerender();
    act(() => result.current.finish());
    expect(result.current.review).toMatchObject({
      tempo: 60,
      range: { start: 2, end: 2 },
      interrupted: true,
      duration: 0.5,
      notes: [{ status: 'matched', delta: 25 }],
    });
  });

  it('does not replace an active capture when record is pressed twice', () => {
    const { result, startTick, observe, player } = setup();
    act(() => {
      expect(result.current.begin()).toBe(true);
      result.current.onPosition(startTick, 60);
      observe(now);
      expect(result.current.begin()).toBe(false);
      result.current.finish();
    });
    expect(player.stop).toHaveBeenCalledTimes(1);
    expect(result.current.review?.notes[0].status).toBe('matched');
  });

  it('starts a fresh clock and fresh evidence after an interrupted take', () => {
    const { result, startTick, observe } = setup();
    act(() => {
      result.current.begin();
      result.current.onPosition(startTick, 60);
      observe(now);
      result.current.finish();
    });
    const firstId = result.current.review?.id;
    act(() => {
      now = 20;
      result.current.begin();
      observe(10);
      now = 24;
      result.current.onPosition(startTick, 60);
      now = 28;
      result.current.finish(true);
    });
    const review = result.current.review!;
    expect(review.id).not.toBe(firstId);
    expect(review.duration).toBe(4);
    expect(review.notes.every((note) => note.status === 'unclear')).toBe(true);
    act(() => {
      observe(24);
      result.current.finish(true);
    });
    expect(result.current.review).toBe(review);
    expect(result.current.takes).toEqual([]);
  });

  it('persists a reviewed take only on explicit save and does not duplicate it', async () => {
    const { result, startTick, observe, notes } = setup();
    act(() => {
      result.current.begin();
      result.current.onPosition(startTick, 60);
      for (const note of notes) observe(now + (note.tick - startTick) / 960, note.midi);
      now += 4;
      result.current.finish(true);
    });
    expect(result.current.review).toMatchObject({ pitchAccuracy: 100, coverage: 100 });
    expect(loadTakes()).toEqual([]);
    await act(() => result.current.save(result.current.review!));
    await act(() => result.current.save(result.current.review!));
    expect(loadTakes()).toEqual([result.current.review]);
    expect(result.current.takes).toHaveLength(1);
  });
});

describe('calibrated take alignment', () => {
  it.each([-45, 80])(
    'applies a frozen %i ms offset exactly once to observations and audio',
    async (offset) => {
      const fixture = takeFixture();
      const finish = vi
        .fn<(origin: number | null, ended: number) => Promise<null>>()
        .mockResolvedValue(null);
      const inputLatency = { current: offset as number | null };
      const { result } = renderHook(() =>
        useTakes({
          ...fixture.options,
          inputLatency,
          recordAudio: { current: () => ({ finish }) },
        }),
      );
      act(() => {
        result.current.begin();
        inputLatency.current = 200;
        now = 14;
        result.current.onPosition(fixture.startTick, 60);
        result.current.onObservation({
          time: 14.01 + offset / 1000,
          midi: fixture.notes[0].midi,
          confidence: 0.99,
          rms: 0.2,
        });
        now = 14.4;
        result.current.finish();
      });
      await act(async () => {});
      expect(result.current.review).toMatchObject({ calibrated: true, latencyMs: offset });
      expect(result.current.review?.notes).toMatchObject([{ status: 'matched', delta: 10 }]);
      expect(finish.mock.calls[0][0]).toBeCloseTo(14 + offset / 1000);
      expect(finish.mock.calls[0][1]).toBeCloseTo(14.4 + offset / 1000);
    },
  );
});

describe('uncalibrated take alignment', () => {
  it('uses the reported delay and lines the recording up with the attacks heard live', async () => {
    const fixture = takeFixture();
    const blob = new Blob(['take']);
    const finish = vi.fn().mockResolvedValue({ blob, peaks: [], duration: 4 });
    const analyse = vi.spyOn(
      await import('../../src/audio/recordedAssessment'),
      'analyseRecordedTake',
    );
    // The recording's own clock runs 70 ms behind the audio clock.
    analyse.mockResolvedValue(
      fixture.notes.map((note) => ({
        time: (note.tick - fixture.startTick) / 960 + 0.012 + 0.07,
        midi: note.midi,
        confidence: 0.99,
        rms: 0.2,
        timingReliable: true,
      })),
    );
    const { result } = renderHook(() =>
      useTakes({
        ...fixture.options,
        reportedLatency: { current: 40 },
        recordAudio: { current: () => ({ finish, snapshot: finish }) },
      }),
    );
    act(() => {
      result.current.begin();
      now = 14;
      result.current.onPosition(fixture.startTick, 60);
      for (const note of fixture.notes)
        result.current.onObservation({
          time: 14 + (note.tick - fixture.startTick) / 960 + 0.04 + 0.01,
          midi: note.midi,
          confidence: 0.99,
          rms: 0.2,
        });
      now = 18;
      result.current.finish(true);
    });
    expect(result.current.review).toMatchObject({ latencyMs: 40, latencySource: 'reported' });
    await act(async () => {});
    // The refined result keeps the recording's finer timing (12 ms), not its 70 ms skew.
    const deltas = result.current.review!.notes.map((n) => n.delta);
    expect(deltas.every((delta) => delta !== null && Math.abs(delta - 10) <= 3)).toBe(true);
    expect(result.current.review).toMatchObject({ calibrated: false, pitchAccuracy: 100 });
    analyse.mockRestore();
  });
});

describe('gym take retention', () => {
  it('automatically saves one finalized result with the settings captured at the start', async () => {
    const { starterExercises } = await import('../../src/music/exerciseCatalog');
    const { exerciseSet } = await import('../../src/domain/gymPlan');
    const fixture = takeFixture(),
      onGymTake = vi.fn();
    const options = {
      ...fixture.options,
      gym: { runId: 'run-one', set: exerciseSet(starterExercises[0]) },
      onGymTake,
    };
    const { result, rerender } = renderHook(() => useTakes(options));
    act(() => {
      result.current.begin();
      now = 14;
      result.current.onPosition(fixture.startTick, 60);
    });
    options.gym = { runId: 'run-two', set: exerciseSet(starterExercises[1]) };
    rerender();
    await act(async () => {
      now = 18;
      result.current.finish(true);
      result.current.finish(true);
    });
    expect(onGymTake).toHaveBeenCalledTimes(1);
    expect(onGymTake.mock.calls[0][0].gym.runId).toBe('run-one');
    expect(result.current.takes).toHaveLength(1);
    expect(loadTakes()[0].gym?.runId).toBe('run-one');
  });
});
