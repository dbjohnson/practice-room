// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGymLibrary } from '../../src/app/useGymLibrary';
import { exerciseLibraryRows } from '../../src/domain/gymLibrary';
import { starterExercises } from '../../src/music/exerciseCatalog';
declare const jsdom: { window: Window };
beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const rows = exerciseLibraryRows(
  Array.from({ length: 1000 }, (_, i) => ({
    ...starterExercises[0],
    id: String(i),
    title: `Exercise ${i}`,
    builtin: false,
  })),
);
it('bounds rendered rows, resets pagination for filters and clamps it after deletion', () => {
  const { result, rerender } = renderHook((items) => useGymLibrary('exercises', items), {
    initialProps: rows,
  });
  expect(result.current.count).toBe(1000);
  expect(result.current.visible).toHaveLength(25);
  act(() => result.current.setPage(39));
  expect(result.current.visible[0].name).toBe('Exercise 975');
  act(() => result.current.update({ query: 'exercise 999' }));
  expect(result.current.page).toBe(0);
  expect(result.current.visible).toHaveLength(1);
  act(() => {
    result.current.clear();
    result.current.setPage(39);
  });
  rerender(rows.slice(0, 26));
  expect(result.current.page).toBe(1);
  expect(result.current.visible).toHaveLength(1);
  rerender([]);
  expect(result.current.page).toBe(0);
  expect(result.current.visible).toHaveLength(0);
});
it('remembers each library’s filters and sort independently across remounts', () => {
  const first = renderHook(() => useGymLibrary('exercises', rows));
  act(() =>
    first.result.current.update({ query: '500', pageSize: 50, sort: 'tempo', descending: true }),
  );
  first.unmount();
  const second = renderHook(() => useGymLibrary('exercises', rows));
  expect(second.result.current.filters).toMatchObject({
    query: '500',
    pageSize: 50,
    sort: 'tempo',
    descending: true,
  });
  const routines = renderHook(() => useGymLibrary('routines', []));
  expect(routines.result.current.filters.query).toBe('');
});
