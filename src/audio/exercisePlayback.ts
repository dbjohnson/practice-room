import { midi } from '@coderline/alphatab';
import type { ExerciseArticulation } from '../domain/gym';

/** Keep exercise attacks on the grid; shape release and picking emphasis only. */
export function exercisePlayback(file: midi.MidiFile, articulation?: ExerciseArticulation) {
  if (!articulation) return;
  for (const track of file.tracks) {
    const active = new Map<string, midi.NoteOnEvent[]>();
    let lastTick = -1,
      attack = -1;
    for (const event of [...track.events].sort((a, b) => a.tick - b.tick)) {
      if (event instanceof midi.NoteOnEvent && event.channel !== 9) {
        if (event.tick !== lastTick) {
          attack++;
          lastTick = event.tick;
        }
        if (articulation === 'alternate')
          event.noteVelocity = Math.max(1, event.noteVelocity + (attack % 2 ? -5 : 3));
        const key = `${event.channel}:${event.noteKey}`;
        const notes = active.get(key) ?? [];
        notes.push(event);
        active.set(key, notes);
      } else if (event instanceof midi.NoteOffEvent) {
        const on = active.get(`${event.channel}:${event.noteKey}`)?.shift();
        // alphaTab already halves staccato notes and applies written accents.
        if (on && articulation !== 'staccato' && articulation !== 'legato')
          event.tick = on.tick + Math.max(1, Math.round((event.tick - on.tick) * 0.92));
      }
    }
    track.events.sort((a, b) => a.tick - b.tick);
  }
}
