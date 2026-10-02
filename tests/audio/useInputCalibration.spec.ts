// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useInputCalibration } from '../../src/audio/useInputCalibration';
import { recordInstrument } from '../../src/audio/recordInstrument';
import { calibrationPattern } from '../../src/audio/latencyCalibration';
import { writeLocal } from '../../src/storage/library';
import type { openInstrumentCapture } from '../../src/audio/instrumentCapture';

vi.mock('../../src/audio/recordInstrument', () => ({ recordInstrument: vi.fn() }));
declare const jsdom: { window: Window };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('measures the same raw attacks before and after saving a correction, including negative offsets', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
  });
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  const rate = 48000;
  const pcm = new Float32Array(rate * 12);
  for (const at of calibrationPattern) {
    const start = Math.round((at + 0.08) * rate);
    pcm.fill(0.5, start, start + rate * 0.01);
  }
  const finish = vi.fn(async (origin: number | null, ended: number) => {
    if (origin !== null) expect(ended).toBeGreaterThan(origin);
    return {
      blob: { arrayBuffer: async () => new ArrayBuffer(1) },
      peaks: [],
      duration: 12,
    };
  });
  vi.mocked(recordInstrument).mockReturnValue({ finish, snapshot: vi.fn() } as never);
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData() {
        return { sampleRate: rate, getChannelData: () => pcm };
      }
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
  );
  const context = {
    currentTime: 0,
    sampleRate: rate,
    destination: {},
    resume: async () => {},
    decodeAudioData: async () => ({}),
    createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({
      playbackRate: { value: 1 },
      connect() {},
      start() {},
      stop() {},
      disconnect() {},
    }),
  };
  const analyser = {};
  const capture = { context, analyser, deviceId: 'usb-test' } as unknown as Awaited<
    ReturnType<typeof openInstrumentCapture>
  >;
  const key = 'usb-test:0:48000:recorded-v2';
  writeLocal('input-calibrations', [{ key, offsetMs: -45, jitterMs: 0, matched: 32 }]);
  const { result } = renderHook(() => useInputCalibration({ current: { capture } }, 0));
  expect(result.current.calibration?.offsetMs).toBe(-45);
  for (const saved of [-45, 80, 240]) {
    act(() =>
      result.current.saveCalibration({
        key,
        offsetMs: saved,
        reliable: true,
        jitterMs: 0,
        matched: 32,
        transients: [],
        reason: '',
      }),
    );
    let measured: Awaited<ReturnType<typeof result.current.calibrate>> | undefined;
    await act(async () => {
      const pending = result.current.calibrate(new AbortController().signal, vi.fn());
      await vi.advanceTimersByTimeAsync(15000);
      measured = await pending;
    });
    // The 2 ms attack windows quantize the synthetic 80 ms delay to 79 ms.
    expect(measured).toMatchObject({ reliable: true, offsetMs: 79, matched: 32 });
    expect(recordInstrument).toHaveBeenLastCalledWith(context, analyser, expect.any(Function));
  }
  const origins = finish.mock.calls.filter(([origin]) => origin !== null).map(([origin]) => origin);
  expect(origins).toHaveLength(3);
  // Identical raw crop positions relative to each measurement's start; no saved offset is added.
  expect(origins[1]! - origins[0]!).toBeCloseTo(15);
  expect(origins[2]! - origins[1]!).toBeCloseTo(15);
});
