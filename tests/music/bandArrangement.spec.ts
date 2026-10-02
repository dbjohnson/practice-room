import { describe, expect, it } from 'vitest';
import { bassBar, pianoVoicing } from '../../src/music/bandArrangement';
import { createScore } from '../../src/music/createScore';
import { studies } from '../../src/music/catalog';
import { createRecipe, expandChords, keys } from '../../src/music/jam';

describe('band arrangements', () => {
  it.each(['straight', 'shuffle', 'bossa'] as const)(
    '%s fills every bar in every key and mode',
    (feel) => {
      for (const key of keys)
        for (const minor of [false, true]) {
          const recipe = createRecipe(key, 'ii-V-I', feel, 120, minor);
          const score = createScore(studies[0], recipe);
          for (const track of score.tracks)
            for (const bar of track.staves[0].bars) {
              expect(bar.voices[0].beats.reduce((sum, b) => sum + b.playbackDuration, 0)).toBe(
                3840,
              );
              for (const beat of bar.voices[0].beats)
                for (const note of beat.notes) {
                  if (track.index < 2) {
                    expect(note.fret).toBeGreaterThanOrEqual(0);
                    expect(note.string).toBeGreaterThan(0);
                  }
                }
            }
          const chords = expandChords(recipe);
          let previous: number[] = [];
          for (const chord of chords) {
            const notes = pianoVoicing(chord, previous);
            expect(notes).toHaveLength(3);
            expect(notes.every((n) => n >= 48 && n <= 76)).toBe(true);
            expect(notes.map((n) => (n - chord.root + 120) % 12).sort()).toEqual(
              chord.intervals.slice(1).sort(),
            );
            if (previous.length)
              expect(
                notes.reduce((sum, n, i) => sum + Math.abs(n - previous[i]), 0),
              ).toBeLessThanOrEqual(12);
            previous = notes;
          }
        }
    },
  );

  it('plays the flattened fifth over a half-diminished chord', () => {
    const recipe = createRecipe('A', 'ii-V-I', 'straight', 90, true);
    const chord = recipe.chords[0];
    const notes = bassBar(chord, recipe.chords[1], 0).map((beat) => beat.notes[0]);
    expect(notes[1] - notes[0]).toBe(6);
  });
});
