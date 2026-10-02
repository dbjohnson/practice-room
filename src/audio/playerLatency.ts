import type { AlphaTabApi } from '@coderline/alphatab';

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
