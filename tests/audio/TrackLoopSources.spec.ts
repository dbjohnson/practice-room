import { expect, it, vi } from 'vitest';
import { TrackLoopSources } from '../../src/audio/TrackLoopSources';

it('starts all parts together and applies live levels/mutes/routes without restarting sources', () => {
  const sources = Array.from({ length: 2 }, () => ({
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  const gains = Array.from({ length: 2 }, () => ({
    gain: { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  let sourceIndex = 0,
    gainIndex = 0;
  const context = {
    currentTime: 10,
    destination: {},
    createBufferSource: () => sources[sourceIndex++],
    createGain: () => gains[gainIndex++],
  };
  const player = new TrackLoopSources(context as unknown as AudioContext);
  const buffer = { duration: 4 } as AudioBuffer;
  player.start(
    [
      { track: 0, buffer },
      { track: 1, buffer },
    ],
    10.5,
    { muted: [0], volumes: {} },
  );
  expect(gains.map((g) => g.gain.value)).toEqual([0, 0.8]);
  player.setMix({ muted: [1], volumes: { 0: 45 } });
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.45, 10, 0.005);
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.005);
  player.setMix({ muted: [], routed: [0], volumes: {} });
  expect(gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.005);
  expect(gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.8, 10, 0.005);
  for (const source of sources) {
    expect(source.start).toHaveBeenCalledExactlyOnceWith(10.5);
    expect(source.stop).not.toHaveBeenCalled();
  }
  player.stop();
  sources.forEach((source) => expect(source.stop).toHaveBeenCalledOnce());
  gains.forEach((gain) => expect(gain.disconnect).toHaveBeenCalledOnce());
});
