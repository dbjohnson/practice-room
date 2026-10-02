// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTakes } from '../../src/app/useTakes';
import { takeFixture } from './takeFixture';
import { loadTakes } from '../../src/storage/library';

declare const jsdom: { window: Window };
let now = 10;
beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  now = 10;
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(record = true) {
  const fixture = takeFixture();
  const snapshot = vi.fn(async () => null),
    finish = vi.fn(async () => null);
  const recordAudio = vi.fn(() => ({ snapshot, finish }));
  const { result } = renderHook(() =>
    useTakes({
      ...fixture.options,
      recordAudio: { current: recordAudio },
      inputLatency: { current: -45 },
    }),
  );
  act(() => expect(result.current.begin(record, true)).toBe(true));
  const pass = (origin: number) => {
    act(() => {
      // Render arrives late, but the audio clock establishes the exact start.
      now = origin + 0.15;
      result.current.onPosition(fixture.startTick + 144, 60, origin);
      for (const note of fixture.notes)
        result.current.onObservation({
          time: origin + (note.tick - fixture.startTick) / 960 - 0.045,
          midi: note.midi,
          confidence: 0.99,
          rms: 0.2,
        });
      now = origin + 4.12;
      result.current.finishPass(origin + 4);
    });
  };
  return { ...fixture, result, pass, snapshot, finish, recordAudio };
}

it('scores consecutive passes without stopping recording or opening a review dialog', async () => {
  const { result, pass, snapshot, finish, recordAudio, player } = setup();
  pass(14);
  expect(result.current.passResult).toMatchObject({
    pass: 1,
    duration: 4,
    pitchAccuracy: 100,
    timingScore: 100,
    interrupted: false,
    latencyMs: -45,
  });
  expect(result.current.recording).toBe(true);
  expect(result.current.review).toBeNull();
  expect(snapshot.mock.calls[0]).toEqual([13.955, 17.955]);
  expect(finish).not.toHaveBeenCalled();
  const firstId = result.current.passResult!.id;
  pass(18);
  await act(async () => {});
  expect(result.current.passResult).toMatchObject({
    pass: 2,
    pitchAccuracy: 100,
    timingScore: 100,
  });
  expect(result.current.passResult!.id).not.toBe(firstId);
  expect(recordAudio).toHaveBeenCalledOnce();
  expect(player.stop).toHaveBeenCalledOnce();
  expect(result.current.takes).toHaveLength(2);
  expect(loadTakes()).toHaveLength(2);
  // Stop at the beginning of pass 3; keep pass 2's result and don't save an empty pass.
  now = 22.05;
  await act(async () => result.current.finish());
  expect(result.current.recording).toBe(false);
  expect(result.current.passResult?.pass).toBe(2);
  expect(result.current.review).toBeNull();
  expect(finish).toHaveBeenCalledExactlyOnceWith(null, 22.05);
  expect(result.current.takes).toHaveLength(2);
});

it('shows play-along pitch and timing feedback without starting a recorder or saving a take', () => {
  const { result, pass, recordAudio, snapshot, finish } = setup(false);
  pass(14);
  expect(result.current.passResult).toMatchObject({
    pass: 1,
    pitchAccuracy: 100,
    timingScore: 100,
  });
  expect(result.current.recording).toBe(false);
  expect(result.current.review).toBeNull();
  expect(recordAudio).not.toHaveBeenCalled();
  expect(snapshot).not.toHaveBeenCalled();
  expect(finish).not.toHaveBeenCalled();
  expect(loadTakes()).toEqual([]);
});

it('does not reuse one pass’s evidence for the next pass', () => {
  const { result, pass, startTick } = setup(false);
  pass(14);
  act(() => {
    now = 18.1;
    result.current.onPosition(startTick + 96, 60, 18);
    now = 22;
    result.current.finishPass(22);
  });
  expect(result.current.passResult).toMatchObject({ pass: 2, pitchAccuracy: null, coverage: 0 });
});
