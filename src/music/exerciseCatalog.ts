import type { Exercise, GymRoutine } from '../domain/gym';
import { defaultTransform } from '../domain/gym';
export interface ScaleDefinition {
  id: string;
  name: string;
  family: string;
  intervals: number[];
}
const modes = (family: string, base: number[], names: string[]) =>
  names.map((name, rotation): ScaleDefinition => ({
    id: name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-$/, ''),
    name,
    family,
    intervals: base.map(
      (_, degree) => (base[(degree + rotation) % base.length] - base[rotation] + 12) % 12,
    ),
  }));
export const scales: ScaleDefinition[] = [
  ...modes(
    'Major modes',
    [0, 2, 4, 5, 7, 9, 11],
    [
      'Ionian (major)',
      'Dorian',
      'Phrygian',
      'Lydian',
      'Mixolydian',
      'Aeolian (natural minor)',
      'Locrian',
    ],
  ),
  ...modes(
    'Harmonic minor modes',
    [0, 2, 3, 5, 7, 8, 11],
    [
      'Harmonic minor',
      'Locrian natural 6',
      'Ionian augmented',
      'Dorian sharp 4',
      'Phrygian dominant',
      'Lydian sharp 2',
      'Super Locrian diminished',
    ],
  ),
  ...modes(
    'Melodic minor modes',
    [0, 2, 3, 5, 7, 9, 11],
    [
      'Melodic minor',
      'Dorian flat 2',
      'Lydian augmented',
      'Lydian dominant',
      'Mixolydian flat 6',
      'Locrian natural 2',
      'Altered',
    ],
  ),
  {
    id: 'major-pentatonic',
    name: 'Major pentatonic',
    family: 'Pentatonic & blues',
    intervals: [0, 2, 4, 7, 9],
  },
  {
    id: 'minor-pentatonic',
    name: 'Minor pentatonic',
    family: 'Pentatonic & blues',
    intervals: [0, 3, 5, 7, 10],
  },
  { id: 'blues', name: 'Blues', family: 'Pentatonic & blues', intervals: [0, 3, 5, 6, 7, 10] },
  {
    id: 'chromatic',
    name: 'Chromatic',
    family: 'Symmetrical scales',
    intervals: Array.from({ length: 12 }, (_, i) => i),
  },
  {
    id: 'whole-tone',
    name: 'Whole tone',
    family: 'Symmetrical scales',
    intervals: [0, 2, 4, 6, 8, 10],
  },
  {
    id: 'diminished-wh',
    name: 'Diminished (whole–half)',
    family: 'Symmetrical scales',
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
  },
  {
    id: 'diminished-hw',
    name: 'Diminished (half–whole)',
    family: 'Symmetrical scales',
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
  },
  ...[
    ['major-arpeggio', 'Major triad', [0, 4, 7]],
    ['minor-arpeggio', 'Minor triad', [0, 3, 7]],
    ['major7-arpeggio', 'Major seventh', [0, 4, 7, 11]],
    ['minor7-arpeggio', 'Minor seventh', [0, 3, 7, 10]],
    ['dominant7-arpeggio', 'Dominant seventh', [0, 4, 7, 10]],
    ['diminished7-arpeggio', 'Diminished seventh', [0, 3, 6, 9]],
  ].map(([id, name, intervals]) => ({
    id: id as string,
    name: name as string,
    family: 'Arpeggios',
    intervals: intervals as number[],
  })),
];
const date = '2026-10-01T00:00:00.000Z';
function preset(
  id: string,
  title: string,
  scaleId: string,
  key: number,
  instrument: Exercise['instrument'],
  description: string,
): Exercise {
  return {
    id,
    title,
    description,
    instrument,
    source: { kind: 'scale', scaleId, key, octaves: 1, direction: 'up-down', pattern: 'straight' },
    defaults: { tempo: 80, rhythm: 'eighths', articulation: 'even' },
    revision: 1,
    createdAt: date,
    updatedAt: date,
    builtin: true,
  };
}
export const starterExercises: Exercise[] = [
  preset(
    'gym-major',
    'Major scale',
    'ionian-major',
    0,
    'guitar',
    'A clean ascent and descent. Start evenly, then explore all twelve keys.',
  ),
  preset(
    'gym-dorian',
    'Dorian groove',
    'dorian',
    2,
    'guitar',
    'Hear the minor third and natural sixth. Build relaxed, even eighth notes.',
  ),
  preset(
    'gym-pentatonic',
    'Minor pentatonic',
    'minor-pentatonic',
    9,
    'guitar',
    'Five familiar notes for picking, accents and tempo ladders.',
  ),
  preset(
    'gym-chromatic',
    'Chromatic warmup',
    'chromatic',
    4,
    'guitar',
    'Every semitone, with a small and repeatable movement.',
  ),
  preset(
    'gym-bass',
    'Bass foundation',
    'ionian-major',
    7,
    'bass',
    'Steady low-register notes with clear attacks and controlled releases.',
  ),
  preset(
    'gym-arpeggio',
    'Seventh-chord arpeggio',
    'dominant7-arpeggio',
    0,
    'guitar',
    'Connect chord tones through the circle of fifths.',
  ),
];
export const starterRoutines: GymRoutine[] = [
  {
    id: 'gym-morning',
    title: 'Daily foundations',
    description:
      'Warm up, settle into a scale, then build speed. Make a copy to shape your own daily practice.',
    builtin: true,
    createdAt: date,
    updatedAt: date,
    blocks: [
      {
        id: 'warmup',
        exerciseId: 'gym-chromatic',
        transform: { ...defaultTransform(70), repetitions: 2 },
      },
      {
        id: 'scale',
        exerciseId: 'gym-major',
        transform: { ...defaultTransform(80), keyOrder: 'fifths', keyCount: 3 },
      },
      {
        id: 'speed',
        exerciseId: 'gym-pentatonic',
        transform: { ...defaultTransform(80), endBpm: 96, bpmStep: 8 },
      },
    ],
  },
];
