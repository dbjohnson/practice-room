import type { Exercise, GymRoutine } from './gym';
import { routineLayout } from './gymPlan';
import { scales } from '../music/exerciseCatalog';
import { keyNames } from '../music/transposeScore';

export type LibrarySort =
  'name' | 'instrument' | 'kind' | 'key' | 'tempo' | 'updated' | 'blocks' | 'sets';
export interface LibraryFilters {
  query: string;
  owner: 'all' | 'mine' | 'starter';
  instrument: 'all' | 'guitar' | 'bass' | 'mixed';
  kind: string;
  key: string;
  favorites: boolean;
  sort: LibrarySort;
  descending: boolean;
  pageSize: number;
}
export interface GymLibraryRow<T> {
  item: T;
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  favorite: boolean;
  instruments: string[];
  instrument: string;
  kind: string;
  kindLabel: string;
  key: number;
  range: string;
  tempo: number;
  tempoLabel: string;
  updated: number;
  blocks: number;
  sets: number;
  error: string;
  search: string;
}
export const defaultLibraryFilters = (): LibraryFilters => ({
  query: '',
  owner: 'all',
  instrument: 'all',
  kind: 'all',
  key: 'all',
  favorites: false,
  sort: 'name',
  descending: false,
  pageSize: 25,
});
export function restoreLibraryFilters(value: unknown): LibraryFilters {
  const defaults = defaultLibraryFilters();
  if (!value || typeof value !== 'object') return defaults;
  const v = value as Partial<LibraryFilters>;
  return {
    ...defaults,
    query: typeof v.query === 'string' ? v.query.slice(0, 200) : '',
    owner: ['all', 'mine', 'starter'].includes(v.owner ?? '') ? v.owner! : 'all',
    instrument: ['all', 'guitar', 'bass', 'mixed'].includes(v.instrument ?? '')
      ? v.instrument!
      : 'all',
    kind: ['all', 'scale', 'arpeggio', 'notes', 'score'].includes(v.kind ?? '') ? v.kind! : 'all',
    key: v.key === 'all' || /^(?:[0-9]|10|11)$/.test(v.key ?? '') ? v.key! : 'all',
    favorites: v.favorites === true,
    sort: ['name', 'instrument', 'kind', 'key', 'tempo', 'updated', 'blocks', 'sets'].includes(
      v.sort ?? '',
    )
      ? v.sort!
      : 'name',
    descending: v.descending === true,
    pageSize: [25, 50, 100].includes(v.pageSize ?? 0) ? v.pageSize! : 25,
  };
}
const modified = (item: Exercise | GymRoutine) =>
  item.builtin ? 0 : Date.parse(item.updatedAt) || 0;
export function exerciseLibraryRows(exercises: Exercise[]): GymLibraryRow<Exercise>[] {
  return exercises.map((item) => {
    const source = item.source;
    const scale = source.kind === 'scale' ? scales.find((s) => s.id === source.scaleId) : undefined;
    const kind = scale?.family === 'Arpeggios' ? 'arpeggio' : source.kind;
    const kindLabel = {
      scale: 'Scale / mode',
      arpeggio: 'Arpeggio',
      notes: 'Custom notes',
      score: 'Score passage',
    }[kind];
    const range =
      source.kind === 'scale'
        ? `${source.octaves === 0.5 ? '½' : source.octaves} oct.`
        : source.kind === 'score'
          ? `${source.endBar - source.startBar + 1} bars`
          : 'Written notes';
    return {
      item,
      id: item.id,
      name: item.title,
      description: item.description,
      builtin: !!item.builtin,
      favorite: !!item.favorite,
      instruments: [item.instrument],
      instrument: item.instrument,
      kind,
      kindLabel,
      key: source.key,
      range,
      tempo: item.defaults.tempo,
      tempoLabel: String(item.defaults.tempo),
      updated: modified(item),
      blocks: 0,
      sets: 0,
      error: '',
      search:
        `${item.title} ${item.description} ${scale?.name ?? ''} ${scale?.family ?? ''} ${item.instrument} ${kindLabel} ${keyNames[source.key]}`.toLowerCase(),
    };
  });
}
export function routineLibraryRows(
  routines: GymRoutine[],
  exercises: Exercise[],
): GymLibraryRow<GymRoutine>[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return routines.map((item) => {
    const members = item.blocks.map((b) => byId.get(b.exerciseId));
    const instruments = [...new Set(members.flatMap((e) => (e ? [e.instrument] : [])))].sort();
    let sets = 0,
      low = 0,
      high = 0,
      error = '';
    try {
      if (!members.length || members.some((e) => !e)) throw new Error('Missing exercise');
      const layout = routineLayout(item);
      sets = layout.count;
      low = layout.lowTempo;
      high = layout.highTempo;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Check routine';
    }
    return {
      item,
      id: item.id,
      name: item.title,
      description: item.description,
      builtin: !!item.builtin,
      favorite: false,
      instruments,
      instrument: instruments.length > 1 ? 'mixed' : (instruments[0] ?? '—'),
      kind: '',
      kindLabel: '',
      key: -1,
      range: '',
      tempo: low,
      tempoLabel: low === high ? String(low) : `${low}–${high}`,
      updated: modified(item),
      blocks: item.blocks.length,
      sets: error ? 0 : sets,
      error,
      search:
        `${item.title} ${item.description} ${members.map((e) => e?.title ?? 'missing exercise').join(' ')} ${instruments.join(' ')}`.toLowerCase(),
    };
  });
}
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function filterLibraryRows<T>(rows: GymLibraryRow<T>[], filters: LibraryFilters) {
  const words = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows
    .filter(
      (row) =>
        words.every((word) => row.search.includes(word)) &&
        (filters.owner === 'all' || (filters.owner === 'starter') === row.builtin) &&
        (filters.instrument === 'all' ||
          (filters.instrument === 'mixed'
            ? row.instruments.length > 1
            : row.instruments.includes(filters.instrument))) &&
        (filters.kind === 'all' || filters.kind === row.kind) &&
        (filters.key === 'all' || Number(filters.key) === row.key) &&
        (!filters.favorites || row.favorite),
    )
    .sort((a, b) => {
      const av = a[filters.sort],
        bv = b[filters.sort];
      const compared =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : collator.compare(String(av), String(bv));
      return (
        (filters.descending ? -compared : compared) ||
        collator.compare(a.name, b.name) ||
        a.id.localeCompare(b.id)
      );
    });
}
