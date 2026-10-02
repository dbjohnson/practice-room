import type { AlphaTabApi } from '@coderline/alphatab';

/** Where the delay removed from a take came from, most trustworthy first. */
export type OffsetSource = 'measured' | 'reported' | 'estimated';
export interface KnownLatency {
  ms: number;
  source: Exclude<OffsetSource, 'estimated'>;
}

const CLICKS = 12;
const CLICK_GAP = 0.35;

// alphaTab does not publish its audio context, but its web output holds one.
export function playerContext(api: AlphaTabApi | null): AudioContext | null {
  const context = (api?.player as { output?: { context?: unknown } } | null | undefined)?.output
    ?.context as AudioContext | null | undefined;
  return context && typeof context.currentTime === 'number' ? context : null;
}

/** Seconds from the player rendering a sample to it being heard, as the browser reports it. */
export function reportedOutputLatency(context: AudioContext | null): number {
  if (!context) return 0;
  const total = (context.baseLatency ?? 0) + (context.outputLatency ?? 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * Plays short clicks through the player's own output and returns when each one was
 * rendered, in seconds on the performance clock that takes use.
 */
export function playClicks(context: AudioContext): { times: number[]; seconds: number } {
  const now = performance.now() / 1000;
  const first = context.currentTime + 0.3;
  const times: number[] = [];
  for (let i = 0; i < CLICKS; i++) {
    const at = first + i * CLICK_GAP;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = 1000;
    gain.gain.value = 0.4;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.012);
    times.push(now + (at - context.currentTime));
  }
  return { times, seconds: 0.3 + CLICKS * CLICK_GAP + 0.4 };
}

/**
 * Round-trip delay, in seconds, from clicks played to attacks heard on the input.
 * Returns null unless most clicks came back with the same delay.
 */
export function loopbackLatency(clicks: number[], attacks: number[]): number | null {
  const delays = clicks
    .map((click) => attacks.find((attack) => attack > click - 0.005 && attack < click + 0.3))
    .map((attack, i) => (attack === undefined ? null : attack - clicks[i]))
    .filter((delay): delay is number => delay !== null)
    .sort((a, b) => a - b);
  const needed = Math.ceil(clicks.length * 0.6);
  if (delays.length < needed) return null;
  const middle = delays[Math.floor(delays.length / 2)];
  const agreeing = delays.filter((delay) => Math.abs(delay - middle) <= 0.01);
  if (agreeing.length < needed) return null;
  return Math.max(0, agreeing[Math.floor(agreeing.length / 2)]);
}
