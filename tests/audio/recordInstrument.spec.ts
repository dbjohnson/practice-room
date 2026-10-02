// @vitest-environment jsdom
import { Blob } from 'node:buffer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { recordInstrument } from '../../src/audio/recordInstrument';

let now = 10;
let recorder: FakeRecorder;
class FakeRecorder extends EventTarget {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() {
    super();
    FakeRecorder.instances.push(this);
  }
  start = vi.fn(() => {
    this.state = 'recording';
  });
  requestData = vi.fn(() => {
    const data = new Blob(['pcm']);
    this.ondataavailable?.({ data });
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data }));
  });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.requestData();
    this.onstop?.();
  });
}
beforeEach(() => {
  now = 10;
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => now * 1000);
  vi.stubGlobal('Blob', Blob);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData() {
        // A continuous decoded stream with identifiable sample positions.
        const samples = Float32Array.from(
          { length: Math.round((now - 10) * 1000) },
          (_, i) => i / 10000,
        );
        return { sampleRate: 1000, length: samples.length, getChannelData: () => samples };
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const track = { stop: vi.fn() };
  const analyser = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    fftSize: 16,
    getFloatTimeDomainData: vi.fn(),
  };
  const context = {
    sampleRate: 1000,
    createMediaStreamDestination: () => ({ stream: { getTracks: () => [track] } }),
  };
  const session = recordInstrument(
    context as unknown as AudioContext,
    analyser as unknown as AnalyserNode,
    vi.fn(),
  );
  recorder = FakeRecorder.instances.at(-1)!;
  return { session, track, analyser };
}

it('crops each pass from a continuously running recorder and releases only on final stop', async () => {
  const { session, track, analyser } = setup();
  now = 14;
  const first = await session.snapshot!(10.1, 14);
  expect(first?.duration).toBe(3.9);
  expect(recorder.start).toHaveBeenCalledExactlyOnceWith(200);
  expect(recorder.stop).not.toHaveBeenCalled();
  expect(track.stop).not.toHaveBeenCalled();
  const wav = new DataView(await first!.blob.arrayBuffer());
  expect(wav.getInt16(44, true) / 32767).toBeCloseTo(0.01, 4);
  now = 18;
  const second = await session.snapshot!(14, 18);
  expect(second?.duration).toBe(4);
  expect(recorder.stop).not.toHaveBeenCalled();
  expect(new DataView(await second!.blob.arrayBuffer()).getInt16(44, true) / 32767).toBeCloseTo(
    0.4,
    4,
  );
  await session.finish(null, 18);
  expect(recorder.stop).toHaveBeenCalledOnce();
  expect(analyser.disconnect).toHaveBeenCalledOnce();
  expect(track.stop).toHaveBeenCalledOnce();
});

it('keeps recording when the browser cannot decode an unfinished container', async () => {
  const { session } = setup();
  const decoder = vi
    .fn()
    .mockRejectedValueOnce(new Error('Missing trailer'))
    .mockResolvedValue({
      sampleRate: 1000,
      length: 8000,
      getChannelData: () => new Float32Array(8000),
    });
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      decodeAudioData = decoder;
    },
  );
  now = 14;
  const pending = session.snapshot!(10, 14);
  await vi.waitFor(() => expect(decoder).toHaveBeenCalledOnce());
  expect(recorder.stop).not.toHaveBeenCalled();
  now = 18;
  await session.finish(null, 18);
  expect((await pending)?.duration).toBe(4);
  expect(recorder.start).toHaveBeenCalledOnce();
});

it('rejects a pending snapshot when the input fails instead of hanging its data listener', async () => {
  const { session, track } = setup();
  recorder.requestData.mockImplementation(() => {
    recorder.onerror?.();
  });
  now = 14;
  await expect(session.snapshot!(10, 14)).rejects.toThrow('interrupted');
  expect(track.stop).toHaveBeenCalledOnce();
});
