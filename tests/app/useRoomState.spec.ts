// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomState } from '../../src/app/useRoomState';
import { openInstrumentCapture } from '../../src/audio/instrumentCapture';
import { takeFixture } from './takeFixture';

vi.mock('../../src/audio/instrumentCapture', () => ({ openInstrumentCapture: vi.fn() }));

declare const jsdom: { window: Window };
let now = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  now = 10;
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function captureFixture() {
  const capture = {
    track: new EventTarget(),
    analyser: { fftSize: 4096, getFloatTimeDomainData: vi.fn() },
    context: { sampleRate: 48000 },
    deviceId: 'test-interface',
    label: 'Test interface',
    channelCount: 2,
    close: vi.fn(),
  };
  vi.mocked(openInstrumentCapture).mockResolvedValue(
    capture as unknown as Awaited<ReturnType<typeof openInstrumentCapture>>,
  );
  return capture;
}

async function setup() {
  const capture = captureFixture();
  const hook = renderHook(useRoomState, { reactStrictMode: true });
  const fixture = takeFixture(hook.result.current.library.score);
  await act(async () => hook.result.current.input.start('test-interface'));
  act(() => {
    hook.result.current.setApi(fixture.options.api.current);
    hook.result.current.updatePlayer({ ready: true });
    hook.result.current.setTrack(1);
    hook.result.current.setTempo(60);
    hook.result.current.setRange({ start: 2, end: 2 });
    hook.result.current.setMode('assess');
  });
  fixture.player.pause.mockClear();
  act(() => hook.result.current.play());
  expect(hook.result.current.takes.recording).toBe(true);
  return { ...hook, ...fixture, capture };
}

describe('recording with an audio interface', () => {
  it.each([false, true])('interrupts a removed input (music started: %s)', async (started) => {
    const { result, capture, player, startTick, notes } = await setup();
    act(() => {
      if (started) {
        now = 14;
        result.current.takes.onPosition(startTick, 60);
        result.current.takes.onObservation({
          time: now,
          midi: notes[0].midi,
          confidence: 0.99,
          rms: 0.2,
        });
        now = 14.5;
        result.current.takes.onPosition(startTick + 480, 60);
      }
      capture.track.dispatchEvent(new Event('ended'));
    });
    expect(result.current.input.status.state).toBe('error');
    expect(result.current.input.status.error).toContain('disconnected');
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(capture.close).toHaveBeenCalledTimes(1);
    expect(result.current.takes.recording).toBe(false);
    expect(result.current.takes.review).toMatchObject({
      interrupted: true,
      duration: started ? 0.5 : 0,
      notes: started ? [{ status: 'matched' }] : [],
    });
    expect(result.current.takes.takes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can reconnect and record again without keeping the old input or take clock', async () => {
    const { result, capture, startTick } = await setup();
    act(() => capture.track.dispatchEvent(new Event('ended')));
    const firstId = result.current.takes.review?.id;
    const replacement = captureFixture();
    await act(async () => result.current.input.start('test-interface'));
    act(() => {
      now = 20;
      result.current.play();
      capture.track.dispatchEvent(new Event('ended'));
    });
    expect(result.current.takes.recording).toBe(true);
    expect(result.current.input.status.state).toBe('ready');
    act(() => {
      now = 24;
      result.current.takes.onPosition(startTick, 60);
      now = 25;
      result.current.halt();
    });
    expect(result.current.takes.review?.id).not.toBe(firstId);
    expect(result.current.takes.review?.duration).toBe(1);
    expect(result.current.takes.review?.notes.every((note) => note.status === 'unclear')).toBe(
      true,
    );
    expect(replacement.close).not.toHaveBeenCalled();
    expect(capture.close).toHaveBeenCalledTimes(1);
  });

  it('stops on navigation and releases the input when the room unmounts', async () => {
    const { result, player, capture, unmount } = await setup();
    act(() => result.current.setPage('library'));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(result.current.takes.recording).toBe(false);
    expect(result.current.takes.review?.interrupted).toBe(true);
    expect(result.current.page).toBe('library');
    unmount();
    expect(capture.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
