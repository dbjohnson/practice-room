import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseLoopPlayer } from '../../src/audio/ExerciseLoopPlayer';

let frame: FrameRequestCallback;
let nodes: ReturnType<typeof node>[];
const node = () => ({
  buffer: null as AudioBuffer | null,
  onended: null as (() => void) | null,
  loop: false,
  loopStart: -1,
  loopEnd: -1,
  start: vi.fn(),
  stop: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
});
beforeEach(() => {
  nodes = [];
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((next) => {
      frame = next;
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(performance, 'now').mockReturnValue(10000);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const gain = {
    gain: { value: 0, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const context = {
    currentTime: 3,
    sampleRate: 48000,
    destination: {},
    createBufferSource: () => {
      const source = node();
      nodes.push(source);
      return source;
    },
    decodeAudioData: vi.fn(async () => ({
      duration: 0.1,
      getChannelData: () => new Float32Array([0.5]),
    })),
    createBuffer: (_count: number, length: number, rate: number) => ({
      length,
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    }),
    createGain: () => gain,
  };
  const player = new ExerciseLoopPlayer(context as unknown as AudioContext);
  const position = vi.fn(),
    pass = vi.fn();
  const buffer = { duration: 4, length: 192000 } as AudioBuffer;
  return { context, player, position, pass, buffer, gain };
}

describe('continuous exercise clock', () => {
  it('toggles the synchronized click gain without restarting music or shifting the next beat', async () => {
    const { context, player, position, pass, buffer, gain } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
    );
    await player.prepareClick(new AbortController().signal);
    const beat = vi.fn();
    player.startLoop(buffer, 3840, 60, false, position, pass, beat);
    expect(gain.gain.value).toBe(0);
    expect(nodes.map((n) => n.start.mock.calls[0][0])).toEqual([3.05, 3.05]);
    context.currentTime = 3.06;
    frame(0);
    expect(beat.mock.lastCall![0]).toBeCloseTo(10.05);
    player.setClick(true);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.55, 3.06, 0.003);
    player.setClick(true, 25);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 3.06, 0.003);
    context.currentTime = 4.07;
    frame(0);
    expect(beat.mock.lastCall![0]).toBeCloseTo(11.05);
    player.setClick(false);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 4.07, 0.003);
    context.currentTime = 7.08;
    frame(0);
    expect(beat.mock.lastCall![0]).toBeCloseTo(14.05);
    expect(pass.mock.lastCall![0]).toBeCloseTo(14.05);
    expect(nodes).toHaveLength(2);
    expect(
      nodes.every((n) => n.start.mock.calls.length === 1 && n.stop.mock.calls.length === 0),
    ).toBe(true);
    player.stop();
    expect(gain.disconnect).toHaveBeenCalledOnce();
  });
  it('uses one native looping source and exact boundaries even when frames are late', () => {
    const { context, player, position, pass, buffer } = setup();
    player.startLoop(buffer, 3840, 60, false, position, pass);
    expect(nodes[0]).toMatchObject({ loop: true, loopStart: 0, loopEnd: 4, buffer });
    expect(nodes[0].start).toHaveBeenCalledExactlyOnceWith(3.05);
    expect(position.mock.calls[0][0]).toMatchObject({ tick: 0, origin: 10.05, pass: 0 });
    context.currentTime = 7.15;
    frame(0);
    expect(pass.mock.calls[0][0]).toBeCloseTo(14.05);
    expect(position.mock.lastCall![0]).toMatchObject({ tick: 96, pass: 1 });
    // Scoring or a background tab may delay several display frames; audio never restarts.
    context.currentTime = 15.55;
    frame(0);
    expect(pass.mock.calls.map(([ended]) => ended)).toEqual([14.05, 18.05, 22.05]);
    expect(position.mock.lastCall![0].origin).toBeCloseTo(22.05);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].start).toHaveBeenCalledTimes(1);
    expect(nodes[0].stop).not.toHaveBeenCalled();
    player.stop();
    expect(nodes[0].stop).toHaveBeenCalledOnce();
    expect(nodes[0].disconnect).toHaveBeenCalledOnce();
  });

  it('keeps a selected passage and changing tempo on one source, with a three-beat count-in', async () => {
    const { context, player, position, pass } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
    );
    await player.prepareClick(new AbortController().signal);
    const timing = {
      startTick: 960,
      duration: 5,
      beatTimes: [0, 1, 3],
      countInBeats: 3,
      countInBeatDuration: 1,
      tickAt: (seconds: number) => (seconds < 1 ? 960 + seconds * 960 : 1920 + (seconds - 1) * 480),
    };
    player.startLoop(
      { duration: 5, length: 240000 } as AudioBuffer,
      2880,
      60,
      true,
      position,
      pass,
      undefined,
      timing,
    );
    expect(nodes.slice(0, 3).map((node) => node.start.mock.calls[0][0])).toEqual([
      3.05, 4.05, 5.05,
    ]);
    expect(position.mock.calls[0][0]).toMatchObject({ tick: 960, origin: 13.05, time: 13.05 });
    context.currentTime = 8.05;
    frame(0);
    expect(position.mock.lastCall![0].tick).toBeCloseTo(2400);
    context.currentTime = 11.55;
    frame(0);
    expect(position.mock.lastCall![0].tick).toBeCloseTo(1440);
    expect(pass.mock.lastCall![0]).toBeCloseTo(18.05);
    expect(nodes).toHaveLength(5);
    expect(
      nodes.every(
        (node) => node.start.mock.calls.length === 1 && node.stop.mock.calls.length === 0,
      ),
    ).toBe(true);
  });

  it('schedules a count-in through the live metronome gain, with beat cues even when muted', async () => {
    const { context, player, position, pass, buffer, gain } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })),
    );
    await player.prepareClick(new AbortController().signal);
    await player.prepareClick(new AbortController().signal);
    expect(fetch).toHaveBeenCalledOnce();
    const beat = vi.fn();
    player.startLoop(buffer, 3840, 120, true, position, pass, beat);
    expect(gain.gain.value).toBe(0);
    expect(nodes.slice(0, 4).every((node) => node.connect.mock.calls[0][0] === gain)).toBe(true);
    context.currentTime = 3.06;
    frame(0);
    expect(beat).toHaveBeenCalled();
    player.setClick(true, 30);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.3, 3.06, 0.003);
    player.setClick(false);
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 3.06, 0.003);
    expect(nodes.slice(0, 4).map((n) => n.start.mock.calls[0][0])).toEqual([
      3.05, 3.55, 4.05, 4.55,
    ]);
    expect(nodes[4].start.mock.calls[0][0]).toBeCloseTo(5.05);
    context.currentTime = 9.1;
    frame(0);
    expect(nodes).toHaveLength(6);
    expect(pass.mock.calls[0][0]).toBeCloseTo(16.05);
    player.stop();
    expect(nodes.every((n) => n.stop.mock.calls.length === 1)).toBe(true);
  });
});

it('finishes the current pass when looping is disabled and allows re-enabling before its end', () => {
  const { context, player, position, pass, buffer } = setup();
  const ended = vi.fn();
  player.startLoop(
    buffer,
    3840,
    60,
    false,
    position,
    pass,
    undefined,
    undefined,
    undefined,
    undefined,
    0,
    ended,
  );
  context.currentTime = 12;
  frame(0);
  player.setLooping(false);
  expect(nodes[0].loop).toBe(false);
  player.setLooping(true);
  expect(nodes[0].loop).toBe(true);
  player.setLooping(false);
  context.currentTime = 15.06;
  frame(0);
  expect(pass).toHaveBeenCalledTimes(2);
  nodes[0].onended!();
  expect(ended).toHaveBeenCalledOnce();
  expect(nodes[0].stop).toHaveBeenCalledOnce();
});

it('starts at the resumed audio offset and keeps the first wrap on the original passage clock', () => {
  const { context, player, position, pass, buffer } = setup();
  const timing = {
    startTick: 0,
    duration: 4,
    beatTimes: [0, 1, 2, 3],
    countInBeats: 4,
    countInBeatDuration: 1,
    tickAt: (seconds: number) => seconds * 960,
  };
  player.startLoop(
    buffer,
    3840,
    60,
    false,
    position,
    pass,
    undefined,
    timing,
    undefined,
    undefined,
    2,
  );
  expect(nodes[0].start).toHaveBeenCalledWith(3.05, 2);
  expect(position.mock.lastCall![0]).toMatchObject({ tick: 1920, time: 10.05 });
  context.currentTime = 5.15;
  frame(0);
  expect(pass.mock.lastCall![0]).toBeCloseTo(12.05);
  expect(position.mock.lastCall![0].tick).toBeCloseTo(96);
});
