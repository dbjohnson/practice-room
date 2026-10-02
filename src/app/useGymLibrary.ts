import { useMemo, useState } from 'react';
import {
  defaultLibraryFilters,
  filterLibraryRows,
  restoreLibraryFilters,
  type GymLibraryRow,
  type LibraryFilters,
  type LibrarySort,
} from '../domain/gymLibrary';
import { readLocal, writeLocal } from '../storage/library';
export function useGymLibrary<T>(kind: 'exercises' | 'routines', rows: GymLibraryRow<T>[]) {
  const [filters, setFilters] = useState(() =>
    restoreLibraryFilters(readLocal(`gym-list-${kind}`, null)),
  );
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => filterLibraryRows(rows, filters), [rows, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  const currentPage = Math.min(page, pages - 1);
  const start = currentPage * filters.pageSize;
  const update = (change: Partial<LibraryFilters>) => {
    setPage(0);
    setFilters((current) => {
      const next = { ...current, ...change };
      writeLocal(`gym-list-${kind}`, next);
      return next;
    });
  };
  const sortBy = (sort: LibrarySort) =>
    update({ sort, descending: filters.sort === sort ? !filters.descending : sort === 'updated' });
  return {
    filters,
    update,
    sortBy,
    page: currentPage,
    setPage,
    pages,
    start,
    total: rows.length,
    count: filtered.length,
    visible: filtered.slice(start, start + filters.pageSize),
    clear: () =>
      update({
        ...defaultLibraryFilters(),
        sort: filters.sort,
        descending: filters.descending,
        pageSize: filters.pageSize,
      }),
  };
}
export type GymLibraryState<T = unknown> = ReturnType<typeof useGymLibrary<T>>;
