import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openInstrumentCapture } from '../../src/audio/instrumentCapture';

const track = {
  readyState: 'live',
  label: 'Test USB interface',
  stop: vi.fn(),
  getSettings: vi.fn(() => ({ deviceId: 'usb-123', channelCount: 2, latency: 0.012 })),
};
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const source = { connect: vi.fn(), disconnect: vi.fn() };
const splitter = { connect: vi.fn(), disconnect: vi.fn() };
const gain = { gain: { setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
const analyser = { fftSize: 0, smoothingTimeConstant: 1, disconnect: vi.fn() };
const detector = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  port: { postMessage: vi.fn(), onmessage: null as ((event: unknown) => void) | null },
};
const sink = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
const context = {
  state: 'running',
  resume: vi.fn(),
  close: vi.fn(),
  destination: {},
  createMediaStreamSource: vi.fn(() => source),
  createChannelSplitter: vi.fn(() => splitter),
  createGain: vi.fn(),
  audioWorklet: { addModule: vi.fn() },
  currentTime: 1,
  createAnalyser: vi.fn(() => analyser),
};
const getUserMedia = vi.fn();
const createContext = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  track.readyState = 'live';
  getUserMedia.mockResolvedValue(stream);
  context.resume.mockResolvedValue(undefined);
  context.createGain.mockReturnValueOnce(gain).mockReturnValueOnce(sink);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices: vi.fn() } });
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      constructor() {
        return detector;
      }
    },
  );
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        createContext();
        return context;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('audio interface capture', () => {
  it('requests the exact interface and preserves channels without monitoring output', async () => {
    const capture = await openInstrumentCapture('usb-123');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'usb-123' },
        channelCount: { ideal: 2 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(capture.channelCount).toBe(2);
    expect(source.connect).toHaveBeenCalledWith(splitter);
    expect(splitter.connect).toHaveBeenCalledWith(gain, 0);
    expect(gain.connect).toHaveBeenCalledWith(analyser);
    expect(gain.connect).toHaveBeenCalledWith(detector);
    capture.selectChannel(1);
    expect(splitter.connect).toHaveBeenLastCalledWith(gain, 1);
    expect(detector.port.postMessage).toHaveBeenCalledWith('reset');
    // The detector reaches the output only through a muted gain.
    expect(detector.connect).toHaveBeenCalledWith(sink);
    expect(sink.gain.value).toBe(0);
    capture.setGain(-6);
    expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(10 ** (-6 / 20), 1, 0.015);
    expect(gain.connect).not.toHaveBeenCalledWith(context.destination);
    expect(source.connect).not.toHaveBeenCalledWith(context.destination);
    expect(splitter.connect).not.toHaveBeenCalledWith(context.destination);
    expect(() => capture.selectChannel(2)).toThrow('available input');
    capture.close();
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });
  it('reports detected notes on the take clock', async () => {
    const capture = await openInstrumentCapture('usb-123');
    const handler = vi.fn();
    vi.spyOn(performance, 'now').mockReturnValue(9000);
    capture.listen(handler);
    const observation = { time: 0.75, midi: 60, confidence: 0.99, rms: 0.2 };
    detector.port.onmessage!({ data: { type: 'observation', observation } });
    // The audio clock reads 1 s now, so this note was processed 0.25 s ago.
    expect(handler).toHaveBeenCalledWith({
      type: 'observation',
      observation: { ...observation, time: 8.75 },
    });
    expect(capture.inputLatency).toBe(0.012);
    capture.close();
    expect(detector.port.onmessage).toBeNull();
    vi.restoreAllMocks();
  });
  it('requires an explicit device choice instead of opening the default microphone', async () => {
    await expect(openInstrumentCapture('')).rejects.toThrow('Choose your audio interface');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
  it('releases a late permission response after cancellation', async () => {
    await expect(openInstrumentCapture('usb-123', () => false)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(track.stop).toHaveBeenCalled();
    expect(createContext).not.toHaveBeenCalled();
  });
  it('releases the stream and context when audio initialization fails', async () => {
    context.resume.mockRejectedValueOnce(new Error('Audio unavailable'));
    await expect(openInstrumentCapture('usb-123')).rejects.toThrow('Audio unavailable');
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });
  it('releases an input removed while the audio context is starting', async () => {
    context.resume.mockImplementationOnce(async () => {
      track.readyState = 'ended';
    });
    await expect(openInstrumentCapture('usb-123')).rejects.toThrow('disconnected');
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
  });
  it('does not replace an unavailable selected device with another input', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Device removed', 'OverconstrainedError'));
    await expect(openInstrumentCapture('usb-123')).rejects.toMatchObject({
      name: 'OverconstrainedError',
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
