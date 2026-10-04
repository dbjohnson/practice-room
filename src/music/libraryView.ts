import { latestVersions } from '../domain/revisions';
import type { Piece } from '../domain/types';

export function librarySource(piece: Piece) {
  if (piece.origin?.source === 'generated') return 'Generated';
  if (piece.origin) return piece.origin.name;
  return piece.source === 'study' ? 'Studies' : piece.source === 'jam' ? 'Jams' : 'Imports';
}
export type LibrarySort = 'title' | 'source' | 'key' | 'bpm' | 'bars';
export interface LibraryFilters {
  query: string;
  source: string;
  key: string;
  tag: string;
}
export const emptyLibraryFilters: LibraryFilters = { query: '', source: '', key: '', tag: '' };
export const libraryPieces = (pieces: Piece[]) =>
  latestVersions(pieces).filter((piece) => piece.source !== 'exercise');

export function filterLibrary(
  pieces: Piece[],
  filters: LibraryFilters,
  sort: LibrarySort,
  descending: boolean,
) {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return pieces
    .filter((piece) => {
      const text = [
        piece.title,
        piece.subtitle,
        piece.filename,
        piece.key,
        librarySource(piece),
        ...piece.tags,
      ]
        .join(' ')
        .toLocaleLowerCase();
      return (
        terms.every((term) => text.includes(term)) &&
        (!filters.source || librarySource(piece) === filters.source) &&
        (!filters.key || piece.key === filters.key) &&
        (!filters.tag || piece.tags.includes(filters.tag))
      );
    })
    .sort((a, b) => {
      const left = sort === 'source' ? librarySource(a) : a[sort];
      const right = sort === 'source' ? librarySource(b) : b[sort];
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true });
      return (descending ? -1 : 1) * order || a.title.localeCompare(b.title);
    });
}
