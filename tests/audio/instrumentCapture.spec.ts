import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openInstrumentCapture } from '../../src/audio/instrumentCapture';

const track = {
  readyState: 'live',
  label: 'Test USB interface',
  stop: vi.fn(),
  getSettings: vi.fn(() => ({ deviceId: 'usb-123', channelCount: 2 })),
};
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
const source = { connect: vi.fn(), disconnect: vi.fn() };
const splitter = { connect: vi.fn(), disconnect: vi.fn() };
const analyser = { fftSize: 0, smoothingTimeConstant: 1, disconnect: vi.fn() };
const context = {
  state: 'running',
  resume: vi.fn(),
  close: vi.fn(),
  destination: {},
  createMediaStreamSource: vi.fn(() => source),
  createChannelSplitter: vi.fn(() => splitter),
  createAnalyser: vi.fn(() => analyser),
};
const getUserMedia = vi.fn();
const createContext = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  track.readyState = 'live';
  getUserMedia.mockResolvedValue(stream);
  context.resume.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices: vi.fn() } });
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
    expect(splitter.connect).toHaveBeenCalledWith(analyser, 0);
    capture.selectChannel(1);
    expect(splitter.connect).toHaveBeenLastCalledWith(analyser, 1);
    expect(source.connect).not.toHaveBeenCalledWith(context.destination);
    expect(splitter.connect).not.toHaveBeenCalledWith(context.destination);
    expect(() => capture.selectChannel(2)).toThrow('available input');
    capture.close();
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
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
