// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useExerciseLoop } from '../../src/audio/useExerciseLoop';
import { renderExerciseLoop } from '../../src/audio/exerciseLoopBuffer';
import type { ExerciseLoopOptions } from '../../src/audio/exerciseLoopBuffer';
import { takeFixture } from '../app/takeFixture';

const startLoop = vi.fn(),
  setClick = vi.fn(),
  stop = vi.fn(),
  close = vi.fn(async () => {});
vi.mock('../../src/audio/ExerciseLoopPlayer', () => ({
  ExerciseLoopPlayer: class {
    context = { resume: async () => {}, close };
    startLoop = startLoop;
    stop = stop;
    prepareClick = async () => {};
    setClick = setClick;
  },
}));
vi.mock('../../src/audio/exerciseLoopBuffer', () => ({ renderExerciseLoop: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal('AudioContext', class {});
  const fixture = takeFixture();
  const options: ExerciseLoopOptions = {
    score: fixture.options.score,
    tempo: 60,
    click: true,
    track: 1,
    mode: 'along',
    muted: [],
    volumes: {},
    effects: { compression: 30, reverb: 40 },
  };
  const callbacks = { position: vi.fn(), pass: vi.fn(), playing: vi.fn(), notify: vi.fn() };
  const hook = renderHook(({ click }) => useExerciseLoop(fixture.options.api, callbacks, click), {
    initialProps: { click: options.click },
  });
  const begin = vi.fn(() => true);
  return { ...hook, options, callbacks, begin, fixture };
}

it('reuses rendered audio for replay and rebuilds it when mix settings change', async () => {
  vi.mocked(renderExerciseLoop).mockResolvedValue({ buffer: {} as AudioBuffer, end: 3840 });
  const { result, options, begin, callbacks, fixture } = setup();
  await act(async () => result.current.start(options, true, null, begin));
  expect(result.current.active).toBe(true);
  expect(begin).toHaveBeenCalledOnce();
  expect(fixture.player.play).not.toHaveBeenCalled();
  expect(callbacks.playing).toHaveBeenCalledWith(true);
  act(() => result.current.stop());
  await act(async () => result.current.start({ ...options }, false, null, begin));
  expect(renderExerciseLoop).toHaveBeenCalledOnce();
  expect(startLoop).toHaveBeenCalledTimes(2);
  act(() => result.current.stop());
  await act(async () =>
    result.current.start(
      { ...options, effects: { compression: 50, reverb: 80 } },
      false,
      null,
      begin,
    ),
  );
  expect(renderExerciseLoop).toHaveBeenCalledTimes(2);
});

it('cancels pending preparation without starting stale music or a stale recording', async () => {
  let complete!: (audio: Awaited<ReturnType<typeof renderExerciseLoop>>) => void;
  const rendering = new Promise<Awaited<ReturnType<typeof renderExerciseLoop>>>((resolve) => {
    complete = resolve;
  });
  vi.mocked(renderExerciseLoop).mockReturnValue(rendering);
  const { result, options, begin, callbacks } = setup();
  let starting: Promise<void>;
  await act(async () => {
    starting = result.current.start(options, true, null, begin);
  });
  expect(result.current.preparing).toBe(true);
  act(() => result.current.stop());
  await act(async () => {
    complete({ buffer: {} as AudioBuffer, end: 3840 });
    await starting;
  });
  expect(begin).not.toHaveBeenCalled();
  expect(startLoop).not.toHaveBeenCalled();
  expect(callbacks.notify).not.toHaveBeenCalled();
  expect(result.current.active).toBe(false);
  expect(result.current.preparing).toBe(false);
});

it('changes the click during a take without rendering or restarting the loop', async () => {
  vi.mocked(renderExerciseLoop).mockResolvedValue({ buffer: {} as AudioBuffer, end: 3840 });
  const { result, options, begin, rerender } = setup();
  await act(async () => result.current.start(options, false, null, begin));
  rerender({ click: false });
  expect(setClick).toHaveBeenLastCalledWith(false);
  expect(startLoop).toHaveBeenCalledOnce();
  expect(result.current.active).toBe(true);
  act(() => result.current.stop());
  await act(async () => result.current.start({ ...options, click: false }, false, null, begin));
  expect(renderExerciseLoop).toHaveBeenCalledOnce();
  expect(setClick).toHaveBeenLastCalledWith(false);
});
