import type { Chord, Feel, JamRecipe } from '../domain/types';

const pitchClasses: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};
const sharpNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flatNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const keys = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function createRecipe(
  key = 'A',
  progression: JamRecipe['progression'] = 'ii-V-I',
  feel: Feel = 'shuffle',
  bpm = 90,
  minor = false,
): JamRecipe {
  const root = pitchClasses[key];
  if (root === undefined) throw new Error('Choose a key from C to B, including sharps or flats.');
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240)
    throw new Error('Choose a tempo between 30 and 240 BPM.');
  const names = key.includes('b') || key === 'F' ? flatNames : sharpNames;
  const chord = (offset: number, quality: 'm7' | '7' | 'maj7' | 'm7b5', bars: number): Chord => ({
    root: (root + offset) % 12,
    name: names[(root + offset) % 12] + quality,
    bars,
    intervals:
      quality === 'm7'
        ? [0, 3, 7, 10]
        : quality === 'm7b5'
          ? [0, 3, 6, 10]
          : quality === '7'
            ? [0, 4, 7, 10]
            : [0, 4, 7, 11],
  });
  let chords: Chord[];
  if (progression === '12-bar blues') {
    chords = [
      chord(0, minor ? 'm7' : '7', 4),
      chord(5, minor ? 'm7' : '7', 2),
      chord(0, minor ? 'm7' : '7', 2),
      chord(7, '7', 1),
      chord(5, minor ? 'm7' : '7', 1),
      chord(0, minor ? 'm7' : '7', 1),
      chord(7, '7', 1),
    ];
  } else if (progression === 'I-IV-V') {
    chords = [
      chord(0, minor ? 'm7' : 'maj7', 2),
      chord(5, minor ? 'm7' : 'maj7', 2),
      chord(7, '7', 2),
      chord(0, minor ? 'm7' : 'maj7', 2),
    ];
  } else
    chords = [
      chord(2, minor ? 'm7b5' : 'm7', 2),
      chord(7, '7', 2),
      chord(0, minor ? 'm7' : 'maj7', 4),
    ];
  return { key, minor, progression, feel, bpm: Math.round(bpm), chords, seed: 42 };
}

export function parseJam(text: string): JamRecipe {
  const prompt = text.trim().replace(/[–—]/g, '-');
  if (!prompt) throw new Error('Describe a groove, such as “shuffle ii-V-I in A at 90 BPM”.');
  const progression = /12\s*[- ]?bar|blues/i.test(prompt)
    ? '12-bar blues'
    : /ii\s*[-, ]\s*V\s*[-, ]\s*I/i.test(prompt)
      ? 'ii-V-I'
      : /\bI\s*[-, ]\s*IV\s*[-, ]\s*V\b/i.test(prompt)
        ? 'I-IV-V'
        : null;
  if (!progression)
    throw new Error(
      'Try ii-V-I, I-IV-V, or 12-bar blues. You can edit the key, feel and tempo below.',
    );
  if (/funk|waltz|reggae|metal|samba|7\/8|3\/4|5\/4/i.test(prompt))
    throw new Error(
      'This prototype arranges 4/4 shuffle, straight and bossa grooves. Choose one of those feels for now.',
    );
  const keyMatch = /\bin\s+([A-G])([#b]?)(?:\s+(major|minor))?(?=\s|$|[,.;])/i.exec(prompt);
  if (/\bin\s+\S+/i.test(prompt) && !keyMatch)
    throw new Error('Choose a key from C to B, including sharps or flats.');
  const key = keyMatch ? keyMatch[1].toUpperCase() + keyMatch[2] : 'A';
  const tempoMatch = /\b(?:at\s+)?(\d+(?:\.\d+)?)\s*bpm\b|\bat\s+(\d+(?:\.\d+)?)\b/i.exec(prompt);
  const bpm = tempoMatch ? Number(tempoMatch[1] ?? tempoMatch[2]) : 90;
  const feel = /bossa/i.test(prompt)
    ? 'bossa'
    : /shuffle|swing/i.test(prompt)
      ? 'shuffle'
      : 'straight';
  return createRecipe(key, progression, feel, bpm, keyMatch?.[3]?.toLowerCase() === 'minor');
}

export function expandChords(recipe: JamRecipe): Chord[] {
  return recipe.chords.flatMap((chord) => Array.from({ length: chord.bars }, () => chord));
}

export function noteName(midi: number): string {
  const value = Math.round(midi);
  return `${sharpNames[((value % 12) + 12) % 12]}${Math.floor(value / 12) - 1}`;
}
