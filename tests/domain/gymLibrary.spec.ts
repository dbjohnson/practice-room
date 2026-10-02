import { describe, expect, it } from 'vitest';
import {
  defaultLibraryFilters,
  exerciseLibraryRows,
  filterLibraryRows,
  restoreLibraryFilters,
  routineLibraryRows,
} from '../../src/domain/gymLibrary';
import { starterExercises, starterRoutines } from '../../src/music/exerciseCatalog';
import { expandRoutine } from '../../src/domain/gymPlan';
import type { Exercise } from '../../src/domain/gym';
const mine: Exercise[] = [
  {
    ...starterExercises[1],
    id: 'mine',
    title: 'Evening drill 10',
    builtin: false,
    favorite: true,
    defaults: { ...starterExercises[1].defaults, tempo: 100 },
  },
  {
    ...starterExercises[1],
    id: 'other',
    title: 'Evening drill 2',
    builtin: false,
    favorite: false,
    defaults: { ...starterExercises[1].defaults, tempo: 80 },
  },
];
describe('gym library search and sorting', () => {
  it('combines owner, instrument, kind, key, favorites and mode search', () => {
    const rows = exerciseLibraryRows([...starterExercises, ...mine]);
    const filters = {
      ...defaultLibraryFilters(),
      query: 'dorian evening',
      owner: 'mine' as const,
      instrument: 'guitar' as const,
      kind: 'scale',
      key: '2',
      favorites: true,
    };
    expect(filterLibraryRows(rows, filters).map((r) => r.id)).toEqual(['mine']);
    expect(filterLibraryRows(rows, { ...filters, instrument: 'bass' })).toEqual([]);
    expect(
      filterLibraryRows(rows, { ...defaultLibraryFilters(), kind: 'arpeggio' }).map(
        (r) => r.kindLabel,
      ),
    ).toEqual(['Arpeggio']);
  });
  it('sorts numbers numerically, titles naturally and ties consistently without mutating input', () => {
    const rows = exerciseLibraryRows(mine);
    expect(filterLibraryRows(rows, defaultLibraryFilters()).map((r) => r.name)).toEqual([
      'Evening drill 2',
      'Evening drill 10',
    ]);
    expect(
      filterLibraryRows(rows, { ...defaultLibraryFilters(), sort: 'tempo' }).map((r) => r.tempo),
    ).toEqual([80, 100]);
    expect(
      filterLibraryRows(rows, { ...defaultLibraryFilters(), sort: 'tempo', descending: true }).map(
        (r) => r.tempo,
      ),
    ).toEqual([100, 80]);
    expect(rows[0].id).toBe('mine');
  });
  it('counts routine sets without constructing queues and searches their exercise names', () => {
    const mixed = {
      ...starterRoutines[0],
      id: 'mixed',
      blocks: [
        ...starterRoutines[0].blocks,
        { ...starterRoutines[0].blocks[0], id: 'bass', exerciseId: 'gym-bass' },
      ],
    };
    const rows = routineLibraryRows([mixed], starterExercises);
    expect(rows[0].sets).toBe(expandRoutine(mixed, starterExercises).length);
    expect(rows[0].instrument).toBe('mixed');
    expect(
      filterLibraryRows(rows, {
        ...defaultLibraryFilters(),
        instrument: 'bass',
        query: 'foundation chromatic',
      }),
    ).toHaveLength(1);
    expect(routineLibraryRows([mixed], [])[0]).toMatchObject({
      error: 'Missing exercise',
      sets: 0,
    });
  });
  it('rejects invalid stored filters and restores a bounded page size', () => {
    expect(restoreLibraryFilters(null)).toEqual(defaultLibraryFilters());
    expect(
      restoreLibraryFilters({
        owner: 'no',
        sort: 'bad',
        pageSize: 999999,
        descending: 'true',
        key: '100',
        favorites: true,
      }),
    ).toEqual({ ...defaultLibraryFilters(), favorites: true });
  });
});
