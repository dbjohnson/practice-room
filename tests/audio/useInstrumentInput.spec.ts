// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInstrumentInput } from '../../src/audio/useInstrumentInput';
import { openInstrumentCapture } from '../../src/audio/instrumentCapture';
import { readLocal, writeLocal } from '../../src/storage/library';

vi.mock('../../src/audio/instrumentCapture', () => ({ openInstrumentCapture: vi.fn() }));
declare const jsdom: { window: Window };
const query = vi.fn();
const capture = () => ({
  track: new EventTarget(),
  analyser: { fftSize: 4096, getFloatTimeDomainData: vi.fn() },
  context: { sampleRate: 48000 },
  deviceId: 'usb-test',
  label: 'Test interface',
  channelCount: 2,
  close: vi.fn(),
  selectChannel: vi.fn(),
  setGain: vi.fn(),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  vi.stubGlobal('navigator', { permissions: { query } });
  query.mockResolvedValue({ state: 'granted' });
  vi.mocked(openInstrumentCapture).mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('remembered audio input', () => {
  it('restores the chosen interface, channel and gain once in StrictMode', async () => {
    writeLocal('input-connection', { deviceId: 'usb-test', channel: 1 });
    writeLocal('input-gain', -6);
    const input = capture();
    vi.mocked(openInstrumentCapture).mockResolvedValue(input as never);
    const { result, unmount } = renderHook(() => useInstrumentInput(vi.fn()), {
      reactStrictMode: true,
    });
    await act(async () => {});
    expect(openInstrumentCapture).toHaveBeenCalledTimes(1);
    expect(openInstrumentCapture).toHaveBeenCalledWith('usb-test', expect.any(Function));
    expect(input.selectChannel).toHaveBeenCalledWith(1);
    expect(input.setGain).toHaveBeenCalledWith(-6);
    expect(result.current.status.state).toBe('ready');
    unmount();
    expect(input.close).toHaveBeenCalledTimes(1);
    expect(readLocal('input-connection', null)).toEqual({ deviceId: 'usb-test', channel: 1 });
  });
  it('does not prompt for revoked permission on reload', async () => {
    writeLocal('input-connection', { deviceId: 'usb-test', channel: 1 });
    query.mockResolvedValue({ state: 'prompt' });
    renderHook(() => useInstrumentInput(vi.fn()));
    await act(async () => {});
    expect(openInstrumentCapture).not.toHaveBeenCalled();
  });
  it('explicit disconnect cancels a pending reconnect and forgets the connection', async () => {
    writeLocal('input-connection', { deviceId: 'usb-test', channel: 1 });
    let resolve!: (value: { state: string }) => void;
    query.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result } = renderHook(() => useInstrumentInput(vi.fn()));
    act(() => result.current.stop());
    await act(async () => resolve({ state: 'granted' }));
    expect(openInstrumentCapture).not.toHaveBeenCalled();
    expect(readLocal('input-connection', null)).toBeNull();
  });
  it('reports a missing remembered device without choosing another microphone', async () => {
    writeLocal('input-connection', { deviceId: 'usb-test', channel: 1 });
    vi.mocked(openInstrumentCapture).mockRejectedValue(
      new DOMException('Missing', 'NotFoundError'),
    );
    const { result } = renderHook(() => useInstrumentInput(vi.fn()));
    await act(async () => {});
    expect(openInstrumentCapture).toHaveBeenCalledTimes(1);
    expect(result.current.status.state).toBe('error');
  });
});
