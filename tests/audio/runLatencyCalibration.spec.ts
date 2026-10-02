// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { runLatencyCalibration } from '../../src/audio/runLatencyCalibration';
import { recordInstrument } from '../../src/audio/recordInstrument';

vi.mock('../../src/audio/recordInstrument', () => ({ recordInstrument: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('cancels all scheduled notes and releases the uncorrected recording', async () => {
  vi.useFakeTimers();
  const finish = vi.fn().mockResolvedValue(null);
  vi.mocked(recordInstrument).mockReturnValue({ finish });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }),
  );
  const nodes: {
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const output = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    currentTime: 0,
    resume: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue({}),
    createGain: () => output,
    destination: {},
    createBufferSource: () => {
      const node = {
        playbackRate: { value: 1 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      };
      nodes.push(node);
      return node;
    },
  } as unknown as AudioContext;
  const abort = new AbortController();
  const pending = runLatencyCalibration(context, {} as AnalyserNode, abort.signal, vi.fn());
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(1);
  expect(nodes).toHaveLength(36); // Four quarter-note count-in clicks, then 32 eighth notes.
  expect(nodes.every((node) => node.start.mock.calls.length === 1)).toBe(true);
  abort.abort();
  await rejected;
  expect(
    nodes.every(
      (node) => node.stop.mock.calls.length === 1 && node.disconnect.mock.calls.length === 1,
    ),
  ).toBe(true);
  expect(output.disconnect).toHaveBeenCalledOnce();
  expect(finish).toHaveBeenCalledWith(null, expect.any(Number));
  expect(vi.getTimerCount()).toBe(0);
});
