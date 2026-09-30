import { describe, expect, it } from 'vitest';
import { createRecipe, expandChords, noteName, parseJam } from '../../src/music/jam';

describe('jam arrangement language', () => {
  it('understands the requested shuffle in A', () => {
    const recipe = parseJam('shuffle beat ii-V-I in A');
    expect(recipe).toMatchObject({ key: 'A', feel: 'shuffle', bpm: 90 });
    expect(recipe.chords.map((c) => c.name)).toEqual(['Bm7', 'E7', 'Amaj7']);
    expect(expandChords(recipe)).toHaveLength(8);
  });
  it('handles minor harmony, flats, sharps and typographic dashes', () => {
    expect(parseJam('bossa ii–V–I in D minor at 112 BPM').chords.map((c) => c.name)).toEqual([
      'Em7b5',
      'A7',
      'Dm7',
    ]);
    expect(parseJam('shuffle ii-V-I in F#').key).toBe('F#');
    expect(parseJam('straight I-IV-V in Bb at 80').chords.map((c) => c.name)).toEqual([
      'Bbmaj7',
      'Ebmaj7',
      'F7',
      'Bbmaj7',
    ]);
    expect(parseJam('blues in E').chords.reduce((n, c) => n + c.bars, 0)).toBe(12);
  });
  it('requires supported harmony and a supported meter/feel', () => {
    for (const prompt of [
      '',
      'play anything',
      'ii-V-I in H',
      'ii-V-I in A at 5',
      'ii-V-I in A at 3000 BPM',
      'funk ii-V-I in C',
      '3/4 ii-V-I in A',
      'ii-V-I in C at 290 BPM',
    ])
      expect(() => parseJam(prompt)).toThrow();
    expect(() => createRecipe('H')).toThrow();
    expect(() => createRecipe('A', 'ii-V-I', 'shuffle', NaN)).toThrow();
  });
  it('supports minor I-IV-V and names concert pitches', () => {
    expect(createRecipe('C', 'I-IV-V', 'straight', 72, true).chords.map((c) => c.name)).toEqual([
      'Cm7',
      'Fm7',
      'G7',
      'Cm7',
    ]);
    expect(
      createRecipe('A', '12-bar blues', 'shuffle', 90, true).chords.map((c) => c.name),
    ).toEqual(['Am7', 'Dm7', 'Am7', 'E7', 'Dm7', 'Am7', 'E7']);
    expect(noteName(69)).toBe('A4');
    expect(noteName(28)).toBe('E1');
  });
});
