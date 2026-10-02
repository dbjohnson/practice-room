// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlphaTabApi } from '@coderline/alphatab';
import { useTakePlayback } from '../../src/audio/useTakePlayback';
import type { RecordingData } from '../../src/audio/recording';

const sources: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  buffer: unknown;
  onended: (() => void) | null;
}[] = [];
const context = {
  currentTime: 0,
  destination: {},
  resume: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  decodeAudioData: vi.fn(async () => ({ duration: 4 })),
  createBufferSource: () => {
    const source = {
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      buffer: null,
      onended: null,
    };
    sources.push(source);
    return source;
  },
};
const data: RecordingData = {
  blob: { arrayBuffer: async () => new ArrayBuffer(1) } as Blob,
  duration: 4,
  peaks: [0.5],
  timeline: [
    { seconds: 0, tick: 3840 },
    { seconds: 4, tick: 7680 },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  sources.length = 0;
  context.currentTime = 0;
  context.decodeAudioData.mockResolvedValue({ duration: 4 });
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        return context;
      }
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup() {
  const player = {
    isReadyForPlayback: true,
    playerState: 0,
    tickPosition: 0,
    countInVolume: 0.6,
    isLooping: true,
    pause: vi.fn(),
    play: vi.fn(() => {
      player.playerState = 1;
    }),
  };
  const api = { current: player as unknown as AlphaTabApi };
  const hook = renderHook(() => useTakePlayback(api, vi.fn()), { reactStrictMode: true });
  return { ...hook, player };
}
describe('recorded take playback', () => {
  it('follows the score clock without restarting audio for normal position updates, then resumes at the paused position', async () => {
    const { result } = setup();
    await act(() => result.current.start(data));
    act(() => result.current.onPosition(3840));
    expect(sources[0].start).toHaveBeenCalledWith(0, 0);
    context.currentTime = 0.5;
    act(() => result.current.onPosition(4320));
    expect(sources).toHaveLength(1);
    act(() => result.current.pauseAudio());
    expect(sources[0].stop).toHaveBeenCalledOnce();
    context.currentTime = 10;
    act(() => result.current.onPosition(4800));
    expect(sources[1].start).toHaveBeenCalledWith(10, 1);
    act(() => result.current.stop());
    expect(sources[1].stop).toHaveBeenCalledOnce();
    expect(result.current.active).toBe(false);
  });
  it('does not start stale audio after navigation cancels decoding', async () => {
    const { result, player } = setup();
    let resolve!: (value: { duration: number }) => void;
    context.decodeAudioData.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.start(data);
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => result.current.stop());
    await act(async () => {
      resolve({ duration: 4 });
      await pending;
    });
    expect(player.play).not.toHaveBeenCalled();
    expect(result.current.active).toBe(false);
    expect(sources).toHaveLength(0);
  });
  it('resynchronizes on a score seek and stops the player when the audio ends', async () => {
    const { result, player } = setup();
    await act(() => result.current.start(data));
    act(() => result.current.onPosition(3840));
    context.currentTime = 0.1;
    act(() => result.current.onPosition(6720));
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(sources[1].start).toHaveBeenCalledWith(0.1, 3);
    act(() => sources[1].onended?.());
    expect(result.current.active).toBe(false);
    expect(player.pause).toHaveBeenCalled();
  });
});
