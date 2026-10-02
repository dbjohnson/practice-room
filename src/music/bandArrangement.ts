import type { Chord, Feel } from '../domain/types';

export interface BandBeat {
  eighths: number;
  notes: number[];
}

/** Close three-note voicings with the smallest movement from the last chord. */
export function pianoVoicing(chord: Chord, previous: number[]): number[] {
  const tones = chord.intervals.slice(1).map((interval) => 48 + chord.root + interval);
  const candidates: number[][] = [];
  for (let inversion = 0; inversion < 3; inversion++) {
    for (const octave of [-12, 0, 12]) {
      const notes = tones
        .map((note, i) => note + octave + (i < inversion ? 12 : 0))
        .sort((a, b) => a - b);
      if (notes[0] >= 48 && notes[2] <= 76) candidates.push(notes);
    }
  }
  const target = previous.length ? previous : [55, 60, 64];
  const distance = (notes: number[]) =>
    notes.reduce((sum, note, i) => sum + Math.abs(note - target[i]), 0);
  return candidates.sort((a, b) => distance(a) - distance(b))[0] ?? tones;
}

export function pianoBar(voicing: number[], feel: Feel, bar: number): BandBeat[] {
  const hits =
    feel === 'bossa'
      ? [0, 3, 6]
      : feel === 'shuffle'
        ? bar % 2
          ? [1, 4, 7]
          : [0, 3, 6]
        : bar % 2
          ? [0, 4, 6]
          : [0, 4];
  const starts = [...new Set([0, ...hits])];
  return starts.map((start, i) => ({
    eighths: (starts[i + 1] ?? 8) - start,
    notes: hits.includes(start) ? voicing : [],
  }));
}

export function bassBar(chord: Chord, next: Chord, bar: number): BandBeat[] {
  const root = 28 + ((chord.root - 4 + 12) % 12);
  let target = 28 + ((next.root - 4 + 12) % 12);
  while (target - root > 7) target -= 12;
  while (root - target > 7) target += 12;
  const approach = Math.max(28, target - (target > root ? 1 : -1));
  const notes =
    bar % 2
      ? [root, root + chord.intervals[1], root + chord.intervals[2], approach]
      : [root, root + chord.intervals[2], root + chord.intervals[1], approach];
  return notes.map((note) => ({ eighths: 2, notes: [note] }));
}

export function drumBar(feel: Feel, bar: number): BandBeat[] {
  return Array.from({ length: 8 }, (_, step) => {
    const notes: number[] = [];
    if (feel === 'bossa') {
      if (step % 2 === 0) notes.push(51);
      if ([0, 3, 4, 7].includes(step)) notes.push(36);
      if ((bar % 2 ? [1, 4, 6] : [2, 5]).includes(step)) notes.push(37);
    } else {
      notes.push(step === 7 && bar % 4 === 1 ? 46 : 42);
      if ((bar % 2 ? [0, 3, 4] : [0, 4]).includes(step)) notes.push(36);
      if (step === 2 || step === 6 || (bar % 2 === 1 && step === 5)) notes.push(38);
      if (bar % 4 === 3 && step === 7) {
        notes.splice(notes.indexOf(42), 1);
        notes.push(45);
      }
    }
    return { eighths: 1, notes };
  });
}
