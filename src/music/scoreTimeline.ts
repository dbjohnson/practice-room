import type { AlphaTabApi, model } from '@coderline/alphatab';
import type { ExpectedNote, LoopRange } from '../domain/types';
import { TICKS_PER_BEAT } from '../time/timeline';

type TickCache = NonNullable<AlphaTabApi['tickCache']>;

export function playbackRange(api: AlphaTabApi, score: model.Score, range: LoopRange) {
  const start = score.masterBars[range.start - 1];
  const end = score.masterBars[range.end - 1];
  const cache = api.tickCache;
  if (!cache || !start || !end) return null;
  const startTick = cache.getMasterBarStart(start);
  const endTick = cache.getMasterBar(end).end;
  return endTick > startTick ? { startTick, endTick } : null;
}

/** Seconds of music between two playback ticks at the written tempi, tempo changes included. */
export function secondsBetween(cache: TickCache, from: number, to: number): number {
  if (to < from) return -secondsBetween(cache, to, from);
  let seconds = 0;
  for (const bar of cache.masterBars) {
    if (bar.end <= from) continue;
    if (bar.start >= to) break;
    bar.tempoChanges.forEach((change, i) => {
      const start = Math.max(from, i === 0 ? bar.start : change.tick);
      const end = Math.min(to, bar.tempoChanges[i + 1]?.tick ?? bar.end);
      if (end > start) seconds += ((end - start) / TICKS_PER_BEAT) * (60 / change.tempo);
    });
  }
  return seconds;
}

export function expectedNotes(
  score: model.Score,
  track: number,
  range: LoopRange,
  api?: AlphaTabApi | null,
  // MIDI input reports every key, so chords can be graded; audio detection hears one note.
  polyphonic = false,
): ExpectedNote[] {
  const result: ExpectedNote[] = [];
  const staff = score.tracks[track]?.staves[0];
  if (!staff) return result;
  for (const bar of staff.bars.slice(range.start - 1, range.end)) {
    for (const voice of bar.voices)
      for (const beat of voice.beats) {
        if (beat.isRest) continue;
        const active = beat.notes.filter((note) => !note.isTieDestination);
        for (const note of active) {
          result.push({
            tick: api?.tickCache?.getBeatStart(beat) ?? beat.absolutePlaybackStart,
            midi: note.realValue,
            bar: bar.index + 1,
            beatId: beat.id,
            eligible:
              (polyphonic || active.length === 1) &&
              !note.hasBend &&
              !note.isDead &&
              !note.isPercussion &&
              !note.isHammerPullOrigin &&
              note.slideInType === 0 &&
              note.slideOutType === 0 &&
              beat.graceType === 0,
          });
        }
      }
  }
  // Simultaneous voices cannot be assessed by a monophonic detector.
  const counts = new Map<number, number>();
  result.forEach((note) => counts.set(note.tick, (counts.get(note.tick) ?? 0) + 1));
  if (!polyphonic)
    result.forEach((note) => {
      if ((counts.get(note.tick) ?? 0) > 1) note.eligible = false;
    });
  return result.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
}
