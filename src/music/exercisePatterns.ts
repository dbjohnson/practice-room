import type { Exercise, PitchPattern, ScaleDirection } from '../domain/gym';
import { scales } from './exerciseCatalog';
export function parseExerciseNotes(text: string): (number | null)[] {
  const tokens = text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 256)
    throw new Error('Enter between 1 and 256 notes, such as C3 D3 E3 R G3.');
  return tokens.map((token) => {
    if (/^(r|rest|-)$/i.test(token)) return null;
    const match = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(token);
    if (!match)
      throw new Error(
        `“${token}” is not a note. Use names with octaves, such as F#3 or Bb2, and R for a rest.`,
      );
    const naturals: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const value =
      (Number(match[3]) + 1) * 12 +
      naturals[match[1].toUpperCase()] +
      (/[#♯]/.test(match[2]) ? 1 : /[b♭]/.test(match[2]) ? -1 : 0);
    if (value < 0 || value > 127) throw new Error(`${token} is outside the supported note range.`);
    return value;
  });
}
function pattern(notes: number[], kind: PitchPattern): number[] {
  if (kind === 'straight') return notes;
  if (kind === 'thirds' || kind === 'fourths') {
    const gap = kind === 'thirds' ? 2 : 3;
    if (notes.length <= gap) return notes;
    return notes
      .flatMap((note, i) => (i + gap < notes.length ? [note, notes[i + gap]] : []))
      .concat(notes.at(-1)!);
  }
  const size = kind === 'groups-three' ? 3 : 4;
  if (notes.length < size) return notes;
  return notes
    .flatMap((_, i) => (i + size <= notes.length ? notes.slice(i, i + size) : []))
    .concat(notes.at(-1)!);
}
export function directedPattern(notes: number[], direction: ScaleDirection, kind: PitchPattern) {
  const ascending = pattern(notes, kind),
    descending = pattern([...notes].reverse(), kind);
  if (direction === 'ascending') return ascending;
  if (direction === 'descending') return descending;
  return direction === 'up-down'
    ? [...ascending, ...descending.slice(1)]
    : [...descending, ...ascending.slice(1)];
}
export function exercisePitches(exercise: Exercise): (number | null)[] {
  const source = exercise.source;
  if (source.kind === 'notes') return parseExerciseNotes(source.notes);
  if (source.kind !== 'scale') throw new Error('This exercise needs its saved score.');
  const scale = scales.find((s) => s.id === source.scaleId);
  if (!scale) throw new Error('Choose a supported scale or arpeggio.');
  const lowest = exercise.instrument === 'bass' ? 28 : 40;
  const root = lowest + ((((source.key - lowest) % 12) + 12) % 12);
  const pitches: number[] = [];
  for (let octave = 0; octave <= Math.ceil(source.octaves); octave++)
    for (const interval of scale.intervals) {
      const offset = octave * 12 + interval;
      if (offset <= source.octaves * 12) pitches.push(root + offset);
    }
  return directedPattern(pitches, source.direction, source.pattern);
}
