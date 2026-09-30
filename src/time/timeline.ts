import type { LoopRange } from '../domain/types';

export const TICKS_PER_BEAT = 960;
export function clampTempo(value: number): number {
  return Number.isFinite(value) ? Math.min(240, Math.max(30, Math.round(value))) : 80;
}
export function normalizeRange(range: LoopRange, bars: number): LoopRange {
  const total = Math.max(1, Math.floor(bars));
  const start = Math.min(total, Math.max(1, Math.floor(range.start) || 1));
  const end = Math.min(total, Math.max(start, Math.floor(range.end) || start));
  return { start, end };
}
export function ticksToSeconds(ticks: number, bpm: number): number {
  if (bpm <= 0 || !Number.isFinite(bpm)) throw new Error('Tempo must be positive.');
  return ((ticks / TICKS_PER_BEAT) * 60) / bpm;
}
export function swingOffset(step: number, ratio = 2): number {
  if (ratio <= 0 || !Number.isFinite(ratio)) throw new Error('Swing ratio must be positive.');
  return Math.floor(step / 2) + (step % 2 ? ratio / (ratio + 1) : 0);
}
export function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
