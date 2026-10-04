import { useState } from 'react';
import { ArrowDown, ArrowUp, Search, Trash2 } from 'lucide-react';
import { LibraryTextEditor } from './LibraryTextEditor';
import type { Piece } from '../domain/types';
import { revisionFamily } from '../domain/revisions';
import {
  emptyLibraryFilters,
  filterLibrary,
  librarySource,
  type LibrarySort,
} from '../music/libraryView';

export function LibraryTable({
  pieces,
  current,
  busy,
  onOpen,
  onRemove,
  onRename,
  onDescribe,
}: {
  pieces: Piece[];
  current: Piece;
  busy: boolean;
  onOpen: (piece: Piece) => void;
  onRemove: (piece: Piece) => void;
  onRename?: (piece: Piece, title: string) => boolean;
  onDescribe?: (piece: Piece, description: string) => boolean;
}) {
  const [filters, setFilters] = useState(emptyLibraryFilters);
  const [sort, setSort] = useState<LibrarySort>('title');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const matches = filterLibrary(pieces, filters, sort, descending);
  const pages = Math.max(1, Math.ceil(matches.length / size));
  const currentPage = Math.min(page, pages - 1);
  const options = (values: string[]) =>
    [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const columns = [
    ['title', 'Title'],
    ['source', 'Source'],
    ['key', 'Key'],
    ['bpm', 'BPM'],
    ['bars', 'Bars'],
  ] as const;
  return (
    <>
      <div className="library-filters">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search your music"
            placeholder="Search titles, artists, tags…"
            value={filters.query}
            onChange={(event) => {
              setFilters({ ...filters, query: event.target.value });
              setPage(0);
            }}
          />
        </label>
        {(
          [
            ['source', 'Source', options(pieces.map(librarySource))],
            ['key', 'Key', options(pieces.map((piece) => piece.key))],
            ['tag', 'Tag', options(pieces.flatMap((piece) => piece.tags))],
          ] as const
        ).map(([field, label, values]) => (
          <label key={field}>
            {label}
            <select
              aria-label={`Filter by ${label.toLowerCase()}`}
              value={filters[field]}
              onChange={(event) => {
                setFilters({ ...filters, [field]: event.target.value });
                setPage(0);
              }}
            >
              <option value="">
                All {label === 'Key' ? 'keys' : label === 'Tag' ? 'tags' : 'sources'}
              </option>
              {values.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button
            className="text-button"
            onClick={() => {
              setFilters(emptyLibraryFilters);
              setPage(0);
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      <p className="library-result-count" role="status">
        {matches.length} of {pieces.length} pieces
      </p>
      <div className="library-table-scroll" role="region" aria-label="Music library" tabIndex={0}>
        <table className="library-table">
          <caption className="visually-hidden">
            Your saved music. Select a title to open it in the player.
          </caption>
          <thead>
            <tr>
              {columns.map(([field, label]) => (
                <th
                  key={field}
                  scope="col"
                  aria-sort={sort === field ? (descending ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    onClick={() => {
                      setDescending(sort === field ? !descending : false);
                      setSort(field);
                      setPage(0);
                    }}
                  >
                    {label}
                    {sort === field &&
                      (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
                  </button>
                </th>
              ))}
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {matches.slice(currentPage * size, (currentPage + 1) * size).map((piece) => (
              <tr
                key={piece.id}
                className={revisionFamily(piece) === revisionFamily(current) ? 'is-current' : ''}
              >
                <td>
                  {onRename ? (
                    <LibraryTextEditor
                      value={piece.title}
                      label="Song name"
                      required
                      disabled={busy}
                      onOpen={() => onOpen(piece)}
                      onSave={(value) => onRename(piece, value)}
                    />
                  ) : (
                    <button
                      className="library-piece-title"
                      disabled={busy}
                      onClick={() => onOpen(piece)}
                    >
                      {piece.title}
                    </button>
                  )}
                  {onDescribe ? (
                    <LibraryTextEditor
                      value={piece.subtitle}
                      label="Description"
                      disabled={busy}
                      onSave={(value) => onDescribe(piece, value)}
                    />
                  ) : (
                    <span className="library-piece-detail">{piece.subtitle}</span>
                  )}
                  <span className="library-piece-detail">
                    {piece.revision ? ` · Version ${piece.revision.number}` : ''}
                    {revisionFamily(piece) === revisionFamily(current) ? ' · In player' : ''}
                  </span>
                </td>
                <td>
                  <span title={piece.origin?.licence}>{librarySource(piece)}</span>
                </td>
                <td>{piece.key}</td>
                <td>{piece.bpm}</td>
                <td>{piece.bars}</td>
                <td>
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={`Remove ${piece.title}`}
                    onClick={() => onRemove(piece)}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!matches.length && (
          <div className="empty-state">
            <h2>{pieces.length ? 'No matching music' : 'Your library is empty'}</h2>
            <p>
              {pieces.length
                ? 'Try another search or clear your filters.'
                : 'Discover a piece, generate one, or import a file above.'}
            </p>
          </div>
        )}
      </div>
      <div className="library-pagination">
        <label>
          Rows{' '}
          <select
            aria-label="Rows per page"
            value={size}
            onChange={(event) => {
              setSize(Number(event.target.value));
              setPage(0);
            }}
          >
            {[25, 50, 100].map((count) => (
              <option key={count}>{count}</option>
            ))}
          </select>
        </label>
        <span>
          Page {currentPage + 1} of {pages}
        </span>
        <button
          className="button button-quiet"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        <button
          className="button button-quiet"
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
