import type { Piece } from '../domain/types';
import { createRecipe } from './jam';

export const studies: Piece[] = [
  {
    id: 'evening-study',
    title: 'Evening study',
    subtitle: 'A little space between the notes',
    source: 'study',
    bpm: 88,
    bars: 8,
    key: 'A major',
    tags: ['Melodic guitar', 'Shuffle', 'Intermediate'],
    color: 'sage',
    recipe: createRecipe('A', 'ii-V-I', 'shuffle', 88),
  },
  {
    id: 'blue-hour',
    title: 'Blue hour',
    subtitle: 'Twelve bars. Endless possibilities.',
    source: 'study',
    bpm: 90,
    bars: 12,
    key: 'E blues',
    tags: ['Guitar & bass', 'Blues', 'Beginner'],
    color: 'terracotta',
    recipe: createRecipe('E', '12-bar blues', 'shuffle', 90),
  },
  {
    id: 'first-light',
    title: 'First light',
    subtitle: 'An easy place to find your footing',
    source: 'study',
    bpm: 72,
    bars: 8,
    key: 'C major',
    tags: ['Single notes', 'Straight', 'Beginner'],
    color: 'lavender',
    recipe: createRecipe('C', 'I-IV-V', 'straight', 72),
  },
];
