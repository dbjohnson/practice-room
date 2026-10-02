import { describe, expect, it } from 'vitest';
import { MidiOutScheduler, scoreEvents, type OutEvent } from '../../src/audio/midiOut';
import { studies } from '../../src/music/catalog';
import { createScore } from '../../src/music/createScore';

type Sent = { output: string; data: number[]; at: number };
// 120 BPM: a quarter note (960 ticks) lasts half a second.
const seconds = (from: number, to: number) => (to - from) / 1920;
const note = (tick: number, key: number, track = 0): OutEvent[] => [
  { tick, track, on: true, key, velocity: 80 },
  { tick: tick + 480, track, on: false, key, velocity: 0 },
];
function setup(events: OutEvent[]) {
  const sent: Sent[] = [];
  const scheduler = new MidiOutScheduler(
    (output, data, at) => sent.push({ output, data, at: Math.round(at * 1000) / 1000 }),
    seconds,
  );
  scheduler.load(
    events.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on)),
    0,
  );
  const context = {
    route: (track: number) => (track === 0 ? { outputId: 'plugin', channel: 10 } : null),
    level: () => 1,
    latency: 0.03,
    range: null as { startTick: number; endTick: number } | null,
    looping: false,
  };
  return { sent, scheduler, context };
}
const ons = (sent: Sent[]) => sent.filter((s) => (s.data[0] & 0xf0) === 0x90);

describe('sending parts to instrument plugins', () => {
  it('extracts every played note of a generated arrangement, drums included', () => {
    const score = createScore(studies[1], studies[1].recipe!);
    const events = scoreEvents(score);
    const drums = events.filter((e) => e.track === 3 && e.on);
    // At least eight hi-hats, two kicks and two snares in each of twelve bars.
    expect(drums.length).toBeGreaterThanOrEqual(12 * 12);
    for (const key of [36, 38, 42]) expect(drums.some((e) => e.key === key)).toBe(true);
    expect(events.filter((e) => e.on).length).toBe(events.filter((e) => !e.on).length);
    expect(events.every((e, i) => i === 0 || events[i - 1].tick <= e.tick)).toBe(true);
    // Shuffle: the off-beat eighth sits two thirds of the way through the beat.
    expect(drums.some((e) => e.tick === 640)).toBe(true);
    expect(drums.some((e) => e.tick === 480)).toBe(false);
  });
  it('sends routed notes just ahead of time, stamped to land with the built-in band', () => {
    const { sent, scheduler, context } = setup([
      ...note(0, 36),
      ...note(960, 38),
      ...note(0, 60, 1),
    ]);
    scheduler.pump(10, context);
    expect(sent).toEqual([]);
    scheduler.position(0, 10);
    scheduler.pump(10, context);
    // Only what is due within the look-ahead, and nothing for the unrouted track.
    expect(sent).toEqual([{ output: 'plugin', data: [0x99, 36, 80], at: 10.03 }]);
    scheduler.pump(10.2, context);
    expect(sent.at(-1)).toEqual({ output: 'plugin', data: [0x89, 36, 0], at: 10.28 });
    scheduler.pump(10.45, context);
    expect(ons(sent).at(-1)).toEqual({ output: 'plugin', data: [0x99, 38, 80], at: 10.53 });
    scheduler.pump(10.46, context);
    expect(ons(sent)).toHaveLength(2);
  });
  it('follows the earliest position report rather than late ones', () => {
    const { sent, scheduler, context } = setup([...note(960, 38)]);
    scheduler.position(0, 10.04); // reported 40 ms late
    scheduler.position(240, 10.125); // on time: the music began at 10.0
    scheduler.position(480, 10.31); // late again
    scheduler.pump(10.42, context);
    expect(ons(sent)[0].at).toBe(10.53);
  });
  it('still plays the opening downbeat when the first report arrives after it', () => {
    const { sent, scheduler, context } = setup([...note(0, 36), ...note(960, 38)]);
    // The music began at 10.0; the player first reports 80 ms later.
    scheduler.position(154, 10.08);
    scheduler.pump(10.08, context);
    expect(ons(sent)).toEqual([{ output: 'plugin', data: [0x99, 36, 80], at: 10.08 }]);
    scheduler.pump(10.42, context);
    expect(ons(sent)[1].at).toBe(10.53);
  });
  it('scales velocity with the fader and skips silent parts', () => {
    const { sent, scheduler, context } = setup([...note(0, 36), ...note(960, 36)]);
    scheduler.position(0, 10);
    scheduler.pump(10, { ...context, level: () => 0.5 });
    expect(ons(sent)[0].data[2]).toBe(40);
    scheduler.pump(10.45, { ...context, level: () => 0 });
    expect(ons(sent)).toHaveLength(1);
  });
  it('loops with the player without waiting for its next report', () => {
    const { sent, scheduler, context } = setup([
      ...note(0, 36),
      ...note(960, 38),
      ...note(1920, 42),
    ]);
    const looping = { ...context, range: { startTick: 0, endTick: 1920 }, looping: true };
    scheduler.position(0, 10);
    for (let now = 10; now < 11.2; now += 0.025) {
      // Reports from the end of the first pass keep arriving after the loop is predicted.
      if (now > 10.9 && now < 11) scheduler.position(Math.round((now - 10) * 1920), now + 0.01);
      scheduler.pump(now, looping);
    }
    scheduler.position(100, 11.06);
    scheduler.pump(11.2, looping);
    expect(ons(sent).map((s) => [s.data[1], s.at])).toEqual([
      [36, 10.03],
      [38, 10.53],
      [36, 11.03],
    ]);
    // Without looping the passage simply ends.
    const once = setup([...note(0, 36), ...note(1920, 42)]);
    once.scheduler.position(0, 10);
    for (let now = 10; now < 11.5; now += 0.025)
      once.scheduler.pump(now, { ...looping, looping: false });
    expect(ons(once.sent)).toHaveLength(1);
  });
  it('silences sounding notes on stop and re-anchors after a seek', () => {
    const { sent, scheduler, context } = setup([...note(0, 36), ...note(3840, 38)]);
    scheduler.position(0, 10);
    scheduler.pump(10, context);
    scheduler.position(3840, 10.1); // the player jumped two bars ahead
    expect(sent.filter((s) => s.data[0] === 0xb9 && s.data[1] === 123).length).toBe(2);
    scheduler.pump(10.1, context);
    expect(ons(sent).at(-1)).toEqual({ output: 'plugin', data: [0x99, 38, 80], at: 10.13 });
    sent.length = 0;
    scheduler.stop(10.2);
    expect(sent.map((s) => s.data)).toEqual([
      [0xb9, 123, 0],
      [0xb9, 123, 0],
    ]);
    scheduler.pump(10.3, context);
    expect(sent).toHaveLength(2);
  });
});
