import type { GymView } from '../domain/gym';
import type { Page, View } from '../domain/types';
import { DEFAULT_SCORE_ZOOM, MAX_SCORE_ZOOM, MIN_SCORE_ZOOM } from './scoreZoom';
import { normalizeTranspose } from '../music/transposeScore';

export interface NavigationState {
  gym?: GymView;
  song: string;
  section: Page;
  part: number;
  view: View;
  zoom: number;
  transpose: number;
}

function choice<T extends string>(value: string | null, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback;
}

export function readNavigation(hash: string): NavigationState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const part = Number(params.get('part') ?? 0);
  const zoom = Number(params.get('zoom') || DEFAULT_SCORE_ZOOM);
  return {
    song: params.get('song') || 'evening-study',
    section: choice(
      params.get('section'),
      ['practice', 'library', 'jam', 'progress', 'instrument', 'gym'],
      'practice',
    ),
    ...(params.has('gym')
      ? {
          gym: choice<GymView>(
            params.get('gym'),
            ['exercises', 'routines', 'progress'],
            'exercises',
          ),
        }
      : {}),
    part: Number.isSafeInteger(part) && part >= 0 ? part : 0,
    view: choice(params.get('view'), ['both', 'score', 'tab'], 'both'),
    transpose: normalizeTranspose(Number(params.get('transpose') ?? 0)),
    zoom: Number.isSafeInteger(zoom)
      ? Math.max(MIN_SCORE_ZOOM, Math.min(MAX_SCORE_ZOOM, zoom))
      : DEFAULT_SCORE_ZOOM,
  };
}

export function navigationHash(state: NavigationState): string {
  return `#${new URLSearchParams({
    song: state.song,
    section: state.section,
    part: String(state.part),
    view: state.view,
    zoom: String(state.zoom),
    transpose: String(state.transpose),
    ...(state.gym && state.gym !== 'exercises' ? { gym: state.gym } : {}),
  })}`;
}
