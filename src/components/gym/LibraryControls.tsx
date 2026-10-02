import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { GymLibraryState } from '../../app/useGymLibrary';
import type { LibrarySort } from '../../domain/gymLibrary';
import { keyNames } from '../../music/transposeScore';
export function LibraryControls({
  kind,
  list,
  onCreate,
}: {
  kind: 'exercises' | 'routines';
  list: GymLibraryState;
  onCreate: () => void;
}) {
  const { filters: f, update } = list;
  const exercise = kind === 'exercises';
  const sorts: [LibrarySort, string][] = [
    ['name', 'Name'],
    ['instrument', 'Instrument'],
    ...(exercise
      ? ([
          ['kind', 'Type'],
          ['key', 'Key'],
        ] as [LibrarySort, string][])
      : ([
          ['blocks', 'Blocks'],
          ['sets', 'Sets'],
        ] as [LibrarySort, string][])),
    ['tempo', 'BPM'],
    ['updated', 'Updated'],
  ];
  return (
    <>
      <div className="gym-library-search">
        <input
          type="search"
          aria-label={`Search ${kind}`}
          placeholder={
            exercise ? 'Search names, modes, notes…' : 'Search routines or their exercises…'
          }
          value={f.query}
          onChange={(e) => update({ query: e.target.value })}
        />
        <button className="button button-primary" onClick={onCreate}>
          <Plus size={16} />
          Create {exercise ? 'exercise' : 'routine'}
        </button>
      </div>
      <div className="gym-library-filters" role="group" aria-label={`Filter ${kind}`}>
        <label>
          Collection
          <select
            aria-label="Collection filter"
            value={f.owner}
            onChange={(e) => update({ owner: e.target.value as typeof f.owner })}
          >
            <option value="all">All {kind}</option>
            <option value="mine">My {kind}</option>
            <option value="starter">Starters</option>
          </select>
        </label>
        <label>
          Instrument
          <select
            aria-label="Instrument filter"
            value={f.instrument}
            onChange={(e) => update({ instrument: e.target.value as typeof f.instrument })}
          >
            <option value="all">All instruments</option>
            <option value="guitar">{exercise ? 'Guitar' : 'Includes guitar'}</option>
            <option value="bass">{exercise ? 'Bass' : 'Includes bass'}</option>
            {!exercise && <option value="mixed">Mixed instruments</option>}
          </select>
        </label>
        {exercise && (
          <>
            <label>
              Type
              <select
                aria-label="Type filter"
                value={f.kind}
                onChange={(e) => update({ kind: e.target.value })}
              >
                <option value="all">All types</option>
                <option value="scale">Scales / modes</option>
                <option value="arpeggio">Arpeggios</option>
                <option value="notes">Custom notes</option>
                <option value="score">Score passages</option>
              </select>
            </label>
            <label>
              Key
              <select
                aria-label="Key filter"
                value={f.key}
                onChange={(e) => update({ key: e.target.value })}
              >
                <option value="all">All keys</option>
                {keyNames.map((key, index) => (
                  <option key={key} value={index}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
            <label className="gym-library-favorite">
              <input
                type="checkbox"
                checked={f.favorites}
                onChange={(e) => update({ favorites: e.target.checked })}
              />
              Favorites only
            </label>
          </>
        )}
        <div className="gym-library-sort">
          <label>
            Sort by
            <select
              aria-label="Sort by"
              value={f.sort}
              onChange={(e) => {
                const sort = e.target.value as LibrarySort;
                update({ sort, descending: sort === 'updated' });
              }}
            >
              {sorts.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            aria-label={f.descending ? 'Sort ascending' : 'Sort descending'}
            onClick={() => update({ descending: !f.descending })}
          >
            {f.descending ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
          </button>
        </div>
        <button className="text-button" onClick={list.clear}>
          Clear filters
        </button>
      </div>
      <div className="gym-library-count" role="status">
        {list.count === list.total
          ? `${list.total} ${kind}`
          : `${list.count} of ${list.total} ${kind}`}
        <span className="gym-library-scroll-hint">Scroll sideways for more columns</span>
      </div>
    </>
  );
}
export function SortHeading({
  label,
  field,
  list,
}: {
  label: string;
  field: LibrarySort;
  list: GymLibraryState;
}) {
  const selected = list.filters.sort === field;
  return (
    <th
      scope="col"
      aria-sort={selected ? (list.filters.descending ? 'descending' : 'ascending') : 'none'}
    >
      <button onClick={() => list.sortBy(field)}>
        {label}
        {selected ? (
          list.filters.descending ? (
            <ArrowDown size={12} />
          ) : (
            <ArrowUp size={12} />
          )
        ) : (
          <ArrowUpDown size={12} />
        )}
      </button>
    </th>
  );
}
export function LibraryPagination({ list, kind }: { list: GymLibraryState; kind: string }) {
  return (
    <div className="gym-library-pagination">
      <span>
        {list.count
          ? `${list.start + 1}–${Math.min(list.start + list.filters.pageSize, list.count)} of ${list.count}`
          : '0'}{' '}
        {kind}
      </span>
      <label>
        Rows per page
        <select
          aria-label="Rows per page"
          value={list.filters.pageSize}
          onChange={(e) => list.update({ pageSize: Number(e.target.value) })}
        >
          {[25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          className="icon-button"
          aria-label={`Previous ${kind} page`}
          disabled={list.page === 0}
          onClick={() => list.setPage(list.page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          Page {list.page + 1} of {list.pages}
        </span>
        <button
          className="icon-button"
          aria-label={`Next ${kind} page`}
          disabled={list.page >= list.pages - 1}
          onClick={() => list.setPage(list.page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
