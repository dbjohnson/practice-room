import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PatternRow } from '../../src/audio/metronome';
import type { Sampler } from '../../src/audio/sampler';

// jsdom does not provide AudioContext. Install a minimal stub on the global so
// the metronome module can construct one and schedule clicks.
type FakeNode = {
  gain: { value: number; setValueAtTime: (v: number, t: number) => void; cancelScheduledValues: (t: number) => void };
  start: (when: number) => void;
  stop: (when: number) => void;
  disconnect: () => void;
  connect: (n: unknown) => void;
  buffer: unknown;
};

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  currentTime = 0;
  state = 'running';
  destination = {};
  sources: FakeNode[] = [];
  gains: FakeNode[] = [];

  resume() {
    return Promise.resolve();
  }
  createGain(): FakeNode {
    const node: FakeNode = {
      gain: { value: 1, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      buffer: null,
    };
    this.gains.push(node);
    return node;
  }
  createBufferSource(): FakeNode {
    const node: FakeNode = {
      gain: { value: 1, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      start: vi.fn((when: number) => {
        this.currentTime = Math.max(this.currentTime, when);
      }),
      stop: vi.fn(),
      disconnect: vi.fn(),
      connect: vi.fn(),
      buffer: null,
    };
    this.sources.push(node);
    return node;
  }
  decodeAudioData() {
    return Promise.resolve({});
  }
}

beforeEach(() => {
  vi.resetModules();
  FakeAudioContext.last = null;
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: FakeAudioContext,
  });
});

function fakeSampler(ctx: FakeAudioContext): Sampler {
  return {
    play: vi.fn((_name: string, when: number, gainValue: number) => {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      source.start(when);
      return { source, gain };
    }),
  } as unknown as Sampler;
}

const basePattern: PatternRow[] = [
  { subdivision: 1, notes: [true, true, true, true], sample: 'kick', gain: 1 },
];

describe('startMetronome validation', () => {
  test('rejects non-positive tempo', async () => {
    const { startMetronome, stopMetronome } = await import('../../src/audio/metronome');
    try {
      await expect(
        startMetronome({
          sampler: {} as Sampler,
          tempo: 0,
          beatsPerBar: 4,
          barCount: 1,
          patterns: basePattern,
        }),
      ).rejects.toThrow(/tempo/i);
    } finally {
      await stopMetronome();
    }
  });

  test('rejects non-positive beatsPerBar', async () => {
    const { startMetronome, stopMetronome } = await import('../../src/audio/metronome');
    try {
      await expect(
        startMetronome({
          sampler: {} as Sampler,
          tempo: 90,
          beatsPerBar: 0,
          barCount: 1,
          patterns: basePattern,
        }),
      ).rejects.toThrow(/beats per bar/i);
    } finally {
      await stopMetronome();
    }
  });

  test('rejects non-positive barCount', async () => {
    const { startMetronome, stopMetronome } = await import('../../src/audio/metronome');
    try {
      await expect(
        startMetronome({
          sampler: {} as Sampler,
          tempo: 90,
          beatsPerBar: 4,
          barCount: 0,
          patterns: basePattern,
        }),
      ).rejects.toThrow(/bar count/i);
    } finally {
      await stopMetronome();
    }
  });
});

describe('metronome scheduling', () => {
  test('invokes onSchedule with derived timing values', async () => {
    const { startMetronome, stopMetronome, getMetronomeContext } = await import('../../src/audio/metronome');
    try {
      const ctx = getMetronomeContext() as unknown as FakeAudioContext;
      const sampler = fakeSampler(ctx);
      const onSchedule = vi.fn();
      const patterns: PatternRow[] = [
        { subdivision: 1, notes: [true, false, true, false], sample: 'kick', gain: 1 },
      ];

      // startMetronome resolves only on stop, so do not await it here.
      void startMetronome({
        sampler,
        tempo: 120,
        beatsPerBar: 4,
        barCount: 1,
        onSchedule,
        patterns,
      });
      await new Promise((r) => setTimeout(r, 0));

      expect(onSchedule).toHaveBeenCalledTimes(1);
      const schedule = onSchedule.mock.calls[0][0];
      expect(schedule.beatsPerBar).toBe(4);
      expect(schedule.playbackBeats).toBe(4);
      expect(schedule.secondsPerBeat).toBeCloseTo(0.5, 5);
      expect(schedule.countInBeats).toBe(4);
      expect(schedule.playbackDuration).toBeCloseTo(2, 5);
    } finally {
      await stopMetronome();
    }
  });

  test('schedules a click per active subdivision step plus count-in', async () => {
    const { startMetronome, stopMetronome, getMetronomeContext } = await import('../../src/audio/metronome');
    try {
      const ctx = getMetronomeContext() as unknown as FakeAudioContext;
      const sampler = fakeSampler(ctx);
      const patterns: PatternRow[] = [
        {
          subdivision: 4,
          notes: Array.from({ length: 16 }, (_, i) => i % 2 === 0),
          sample: 'hihat',
          gain: 0.5,
        },
      ];

      void startMetronome({
        sampler,
        tempo: 120,
        beatsPerBar: 4,
        barCount: 1,
        patterns,
      });
      await new Promise((r) => setTimeout(r, 0));

      const totalSteps = patterns[0].notes.length;
      // Every step is scheduled (inactive ones are muted via gain), plus the
      // 4-beat count-in.
      expect(ctx.sources.length).toBe(totalSteps + 4);
    } finally {
      await stopMetronome();
    }
  });

  test('stopMetronome resolves the playback promise', async () => {
    const { startMetronome, stopMetronome, getMetronomeContext } = await import('../../src/audio/metronome');
    const ctx = getMetronomeContext() as unknown as FakeAudioContext;
    const sampler = fakeSampler(ctx);
    const promise = startMetronome({
      sampler,
      tempo: 90,
      beatsPerBar: 4,
      barCount: 1,
      patterns: basePattern,
    });
    await new Promise((r) => setTimeout(r, 0));
    await stopMetronome();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('getMetronomeContext', () => {
  test('returns a shared AudioContext instance', async () => {
    const { getMetronomeContext } = await import('../../src/audio/metronome');
    const a = getMetronomeContext();
    const b = getMetronomeContext();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(FakeAudioContext);
  });
});
