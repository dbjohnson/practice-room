import { describe, expect, it } from 'vitest';
import { fingerChord, tuningFor } from '../../src/music/fretting';

const guitar = [64, 59, 55, 50, 45, 40];
describe('fingering', () => {
  it('keeps a scale run in one position instead of chasing open strings', () => {
    let position = 5;
    const frets = [57, 59, 60, 62, 64].map((midi) => {
      const result = fingerChord([midi], guitar, position);
      position = result.position;
      return result.notes[0].fret;
    });
    expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
  });
  it('places a chord on separate strings within a hand span', () => {
    const { notes } = fingerChord([40, 47, 52, 56, 59, 64], guitar, 0);
    expect(notes.map((note) => [note.string, note.fret])).toEqual([
      [1, 0],
      [2, 2],
      [3, 2],
      [4, 1],
      [5, 0],
      [6, 0],
    ]);
  });
  it('drops inner notes that cannot be reached and reports unplayable pitches as empty', () => {
    const cluster = fingerChord([40, 41, 42, 64], guitar, 0).notes.map((note) => note.midi);
    expect(cluster).toContain(40);
    expect(cluster).toContain(64);
    expect(cluster.length).toBeLessThan(4);
    expect(fingerChord([20], guitar, 0).notes).toEqual([]);
  });
  it('chooses tunings by instrument, name and range', () => {
    expect(tuningFor(27, 'Lead', 40, 76)).toEqual(guitar);
    expect(tuningFor(27, 'Lead', 38, 76)?.at(-1)).toBe(38);
    expect(tuningFor(0, 'Guitar:upperVoice', 43, 67)).toEqual(guitar);
    expect(tuningFor(33, 'Bass', 23, 50)).toEqual([43, 38, 33, 28, 23]);
    expect(tuningFor(0, 'Piano', 40, 76)).toBeNull();
    expect(tuningFor(27, 'Lead', 20, 76)).toBeNull();
  });
});
