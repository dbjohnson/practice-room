import { midi } from '@coderline/alphatab';
import type { JamRecipe } from '../domain/types';

const alternateHits = new Map<number, number[]>([
  [36, [36, 90]],
  [38, [38, 91]],
  [37, [37, 92]],
  [42, [42, 93]],
  [51, [51, 94]],
]);

function variation(seed: number, tick: number, key: number): number {
  let value = Math.imul(seed ^ tick, 1597334677) ^ Math.imul(key + 1, 3812015801);
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  return ((value ^ (value >>> 13)) >>> 0) / 0xffffffff;
}

/** Shape generated performances only; imported expression and score timing stay intact. */
export function naturalPlayback(file: midi.MidiFile, recipe?: JamRecipe) {
  if (!recipe) return;
  const events = file.tracks.flatMap((track) => track.events).sort((a, b) => a.tick - b.tick);
  const active = new Map<string, midi.NoteOnEvent[]>();
  const pairs: { on: midi.NoteOnEvent; off: midi.NoteOffEvent }[] = [];
  for (const event of events) {
    if (event instanceof midi.NoteOnEvent) {
      const key = `${event.channel}:${event.noteKey}`;
      const notes = active.get(key) ?? [];
      notes.push(event);
      active.set(key, notes);
    } else if (event instanceof midi.NoteOffEvent) {
      const on = active.get(`${event.channel}:${event.noteKey}`)?.shift();
      if (on) pairs.push({ on, off: event });
    }
  }
  const hitCounts = new Map<number, number>();
  for (const { on, off } of pairs) {
    const originalKey = on.noteKey;
    const tick = on.tick;
    const duration = off.tick - tick;
    const quarter = Math.floor((tick % 3840) / 960);
    const offbeat = tick % 960 >= 400;
    const amount = variation(recipe.seed, tick, originalKey);
    let velocity = on.noteVelocity;
    let gate = 1;
    let delay = 0;
    if (on.channel === 9) {
      velocity =
        originalKey === 36
          ? quarter === 0
            ? 98
            : 86
          : originalKey === 38
            ? quarter === 1 || quarter === 3
              ? 92
              : 35
            : originalKey === 37
              ? 76
              : [42, 44, 46].includes(originalKey)
                ? offbeat
                  ? 48
                  : 65
                : originalKey === 51
                  ? offbeat
                    ? 53
                    : 70
                  : 77;
      // A little laid-back snare; bar downbeats remain exact for clean loops.
      delay = tick % 3840 === 0 ? 0 : originalKey === 38 ? 8 : Math.round(amount * 5);
      const choices = alternateHits.get(originalKey);
      if (choices) {
        const count = hitCounts.get(originalKey) ?? 0;
        on.noteKey = off.noteKey = choices[count % choices.length];
        hitCounts.set(originalKey, count + 1);
      }
    } else if (on.channel === 2) {
      velocity = [94, 73, 85, 68][quarter];
      gate = quarter === 3 ? 0.78 : 0.91 + amount * 0.06;
    } else if (on.channel === 4) {
      velocity = (offbeat ? 62 : 71) + (originalKey >= 64 ? 4 : -3);
      gate = recipe.feel === 'bossa' ? 0.55 : 0.7;
      delay = tick % 3840 === 0 ? 0 : Math.round(amount * 8);
    } else if (on.channel === 0) {
      velocity = (offbeat ? 72 : 85) + (quarter === 0 ? 5 : 0);
      gate = offbeat ? 0.84 : 0.95;
    }
    // Never move guitar/bass attacks: these are the written practice targets.
    on.noteVelocity = Math.max(1, Math.min(127, Math.round(velocity + (amount - 0.5) * 8)));
    on.tick = tick + delay;
    off.tick = Math.max(on.tick + 1, Math.min(off.tick, tick + Math.round(duration * gate)));
  }
  for (const track of file.tracks) track.events.sort((a, b) => a.tick - b.tick);
}
