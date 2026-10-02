import type { LoopRange, Piece } from '../domain/types';
import { clampTempo, normalizeRange } from '../time/timeline';
import { readLocal, writeLocal } from './library';

/**
 * How a piece was last practiced: restored when it is opened again. The part, view and
 * zoom travel in the page address instead.
 */
export interface PieceSettings {
  pieceId: string;
  tempo: number;
  range: LoopRange;
  muted: number[];
  volumes: Record<number, number>;
}
const KEY = 'pieceSettings';
const LIMIT = 100;
type Stored = Record<string, Partial<Omit<PieceSettings, 'pieceId'>>>;

function readAll(): Stored {
  const all = readLocal<unknown>(KEY, {});
  return all && typeof all === 'object' && !Array.isArray(all) ? (all as Stored) : {};
}

/** Defaults for a piece that keeps no settings of its own, such as a gym exercise. */
export function defaultPieceSettings(piece: Piece): PieceSettings {
  return {
    pieceId: piece.id,
    tempo: piece.bpm,
    range: { start: 1, end: piece.bars },
    muted: [],
    volumes: {},
  };
}

export function loadPieceSettings(piece: Piece, trackCount: number): PieceSettings {
  const stored = readAll()[piece.id] ?? {};
  const tracks = Math.max(1, trackCount);
  const isTrack = (value: unknown) => Number.isInteger(value) && Number(value) < tracks;
  const range = stored.range && typeof stored.range === 'object' ? stored.range : null;
  return {
    pieceId: piece.id,
    tempo: Number.isFinite(stored.tempo) ? clampTempo(stored.tempo!) : piece.bpm,
    range: normalizeRange(range ?? { start: 1, end: piece.bars }, piece.bars),
    muted: Array.isArray(stored.muted) ? stored.muted.filter(isTrack) : [],
    volumes: Object.fromEntries(
      Object.entries(
        stored.volumes && typeof stored.volumes === 'object' ? stored.volumes : {},
      ).filter(([track, volume]) => isTrack(Number(track)) && volume >= 0 && volume <= 100),
    ),
  };
}

export function savePieceSettings(settings: PieceSettings): boolean {
  const { pieceId, tempo, range, muted, volumes } = settings;
  const all = readAll();
  // Re-inserting moves the piece to the end, so the oldest entries are dropped first.
  delete all[pieceId];
  all[pieceId] = { tempo, range, muted, volumes };
  const ids = Object.keys(all);
  for (const id of ids.slice(0, Math.max(0, ids.length - LIMIT))) delete all[id];
  return writeLocal(KEY, all);
}

export function forgetPieceSettings(pieceId: string) {
  const all = readAll();
  delete all[pieceId];
  writeLocal(KEY, all);
}
