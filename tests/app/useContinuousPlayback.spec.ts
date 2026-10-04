// @vitest-environment jsdom
import type { AlphaTabApi } from '@coderline/alphatab';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRoomState } from '../../src/app/useRoomState';
import { openInstrumentCapture } from '../../src/audio/instrumentCapture';
import { takeFixture } from './takeFixture';

vi.mock('../../src/audio/instrumentCapture', () => ({ openInstrumentCapture: vi.fn() }));
vi.mock('../../src/audio/recordInstrument', () => ({
  recordInstrument: vi.fn(() => ({ finish: vi.fn(async () => null) })),
}));
const loop = vi.hoisted(() => ({
  active: false,
  preparing: false,
  start: vi.fn(),
  stop: vi.fn(),
  setLooping: vi.fn(),
}));
vi.mock('../../src/audio/useExerciseLoop', () => ({ useExerciseLoop: () => loop }));
declare const jsdom: { window: Window };
beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  vi.clearAllMocks();
  loop.active = false;
  loop.preparing = false;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('uses continuous audio for ordinary full-score and selected-passage loops', () => {
  const { result } = renderHook(useRoomState);
  const { player } = takeFixture();
  act(() => {
    result.current.setApi(player as unknown as AlphaTabApi);
    result.current.updatePlayer({ ready: true });
  });
  act(() => result.current.play());
  expect(loop.start).toHaveBeenCalledOnce();
  expect(loop.start.mock.calls[0][0]).toMatchObject({
    score: result.current.library.score,
    range: result.current.range,
    mode: 'listen',
  });
  expect(loop.start.mock.calls[0][3]()).toBe(true);
  expect(player.play).not.toHaveBeenCalled();
  act(() => result.current.setRange({ start: 2, end: 3 }));
  act(() => result.current.play());
  expect(loop.start.mock.lastCall![0].range).toEqual({ start: 2, end: 3 });
  act(() => result.current.setLoop(false));
  act(() => result.current.play());
  expect(player.play).toHaveBeenCalledOnce();
});

it('records a connected instrument automatically for a selected continuous passage', async () => {
  vi.mocked(openInstrumentCapture).mockResolvedValue({
    track: new EventTarget(),
    analyser: { fftSize: 4096, getFloatTimeDomainData: vi.fn() },
    listen: vi.fn(),
    inputLatency: 0,
    context: { sampleRate: 48000 },
    deviceId: 'test-interface',
    label: 'Test interface',
    channelCount: 2,
    selectChannel: vi.fn(),
    setGain: vi.fn(),
    close: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof openInstrumentCapture>>);
  const { result } = renderHook(useRoomState);
  const { player } = takeFixture(result.current.library.score);
  await act(async () => result.current.input.start('test-interface'));
  act(() => {
    result.current.setApi(player as unknown as AlphaTabApi);
    result.current.updatePlayer({ ready: true });
    result.current.setRange({ start: 2, end: 3 });
  });
  act(() => result.current.play());
  expect(loop.start).toHaveBeenCalledOnce();
  act(() => {
    expect(loop.start.mock.lastCall![3]()).toBe(true);
  });
  expect(result.current.takes.recording).toBe(true);
  expect(player.play).not.toHaveBeenCalled();
  act(() => result.current.halt());
  expect(result.current.takes.recording).toBe(false);
});

it('resumes at the current tick after tempo changes, restarts from the beginning, and cancels pending resume on stop', () => {
  vi.useFakeTimers();
  const { result } = renderHook(useRoomState);
  const { player } = takeFixture();
  act(() => {
    result.current.setApi(player as unknown as AlphaTabApi);
    result.current.updatePlayer({ ready: true, playing: true });
  });
  player.tickPosition = 1920;
  act(() => result.current.setTempo(88));
  act(() => vi.advanceTimersByTime(220));
  expect(loop.start.mock.lastCall![0].tempo).toBe(88);
  expect(loop.start.mock.lastCall![4]).toBe(1920);
  act(() => result.current.updatePlayer({ playing: true }));
  act(() => result.current.restart());
  act(() => vi.advanceTimersByTime(220));
  expect(loop.start.mock.lastCall![4]).toBeUndefined();
  act(() => result.current.updatePlayer({ playing: true }));
  act(() => result.current.setTempo(92));
  act(() => result.current.halt());
  const starts = loop.start.mock.calls.length;
  act(() => vi.advanceTimersByTime(500));
  expect(loop.start).toHaveBeenCalledTimes(starts);
});

it('toggles looping in place while native playback is active', () => {
  const { result } = renderHook(useRoomState);
  loop.active = true;
  act(() => result.current.updatePlayer({ ready: true, playing: true }));
  act(() => result.current.setLoop(false));
  expect(loop.setLooping).toHaveBeenLastCalledWith(false);
  expect(loop.stop).not.toHaveBeenCalled();
  expect(result.current.player.playing).toBe(true);
  act(() => result.current.setLoop(true));
  expect(loop.setLooping).toHaveBeenLastCalledWith(true);
});
