import { midi, type AlphaTabApi } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { naturalPlayback } from '../../src/audio/naturalPlayback';
import { studies } from '../../src/music/catalog';
import { createScore } from '../../src/music/createScore';
import { createRecipe } from '../../src/music/jam';
import { expectedNotes } from '../../src/music/scoreTimeline';
import manifest from '../../src/audio/assets/band-manifest.json';

function fixture(feel: 'straight' | 'shuffle' | 'bossa' = 'shuffle', bpm = 90) {
  const recipe = createRecipe('A', 'ii-V-I', feel, bpm);
  const score = createScore(studies[0], recipe);
  const file = new midi.MidiFile();
  const generator = new midi.MidiFileGenerator(
    score,
    null,
    new midi.AlphaSynthMidiFileHandler(file),
  );
  generator.generate();
  return { recipe, score, file, api: { tickCache: generator.tickLookup } as AlphaTabApi };
}
const events = (file: midi.MidiFile) => file.tracks.flatMap((track) => track.events);
const attacks = (file: midi.MidiFile) => events(file).filter((e) => e instanceof midi.NoteOnEvent);
const serialize = (file: midi.MidiFile) => JSON.stringify(events(file));

describe('generated performance expression', () => {
  it.each(['straight', 'shuffle', 'bossa'] as const)(
    '%s preserves practice attacks, tempo, loop boundaries and ordered note pairs',
    (feel) => {
      for (const bpm of [30, 240]) {
        const { file, recipe, score, api } = fixture(feel, bpm);
        const otherEvents = () =>
          JSON.stringify(
            events(file).filter(
              (e) => !(e instanceof midi.NoteOnEvent) && !(e instanceof midi.NoteOffEvent),
            ),
          );
        const before = otherEvents();
        const count = attacks(file).length;
        const targets = [0, 1].map((track) =>
          expectedNotes(score, track, { start: 1, end: 8 }, api),
        );
        naturalPlayback(file, recipe);
        expect(otherEvents()).toBe(before);
        expect(attacks(file)).toHaveLength(count);
        for (const [track, channel] of [0, 2].entries()) {
          expect(
            attacks(file)
              .filter((e) => e.channel === channel)
              .map((e) => [e.tick, e.noteKey]),
          ).toEqual(targets[track].map((note) => [note.tick, note.midi]));
        }
        const pending = new Map<string, number>();
        let previous = -1;
        for (const event of events(file)) {
          expect(event.tick).toBeGreaterThanOrEqual(previous);
          previous = event.tick;
          if (event instanceof midi.NoteOnEvent) {
            const key = `${event.channel}:${event.noteKey}`;
            expect(pending.has(key)).toBe(false);
            pending.set(key, event.tick);
            expect(event.noteVelocity).toBeGreaterThan(0);
            expect(event.noteVelocity).toBeLessThanOrEqual(127);
          } else if (event instanceof midi.NoteOffEvent) {
            const key = `${event.channel}:${event.noteKey}`;
            expect(event.tick).toBeGreaterThan(pending.get(key)!);
            pending.delete(key);
          }
        }
        expect(pending.size).toBe(0);
      }
    },
  );

  it('uses alternate drum recordings, ghost notes and different strengths within chords', () => {
    const { file, recipe } = fixture();
    naturalPlayback(file, recipe);
    const notes = attacks(file);
    const drums = notes.filter((e) => e.channel === 9);
    for (const key of [36, 90, 38, 91, 42, 93])
      expect(drums.some((e) => e.noteKey === key)).toBe(true);
    const snare = drums.filter((e) => [38, 91].includes(e.noteKey));
    expect(Math.min(...snare.map((e) => e.noteVelocity))).toBeLessThan(40);
    expect(Math.max(...snare.map((e) => e.noteVelocity))).toBeGreaterThan(85);
    const chord = notes.filter((e) => e.channel === 4 && e.tick === 0);
    expect(chord).toHaveLength(3);
    expect(new Set(chord.map((e) => e.noteVelocity)).size).toBeGreaterThan(1);
  });

  it('is repeatable for the same seed and bypasses imported performances', () => {
    const a = fixture();
    const b = fixture();
    naturalPlayback(a.file, a.recipe);
    naturalPlayback(b.file, b.recipe);
    expect(serialize(a.file)).toBe(serialize(b.file));
    const imported = fixture().file;
    const before = serialize(imported);
    naturalPlayback(imported);
    expect(serialize(imported)).toBe(before);
    const c = fixture();
    naturalPlayback(c.file, { ...c.recipe, seed: 99 });
    expect(serialize(c.file)).not.toBe(serialize(a.file));
  });

  it('uses multiple recorded layers within each generated melodic part', () => {
    const { file, recipe } = fixture();
    naturalPlayback(file, recipe);
    for (const [channel, program] of [
      [0, 27],
      [2, 33],
      [4, 0],
    ]) {
      const layers = new Set<number>();
      for (const note of attacks(file).filter((e) => e.channel === channel)) {
        const region = manifest.find(
          (r) =>
            r.bank === 0 &&
            r.program === program &&
            r.low <= note.noteKey &&
            r.high >= note.noteKey &&
            r.velocity[0] <= note.noteVelocity &&
            r.velocity[1] >= note.noteVelocity,
        );
        expect(region).toBeDefined();
        layers.add(region!.velocity[0]);
      }
      expect(layers.size).toBeGreaterThanOrEqual(3);
    }
  });
});
