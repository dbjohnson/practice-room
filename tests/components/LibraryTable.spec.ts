// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryTable } from '../../src/components/LibraryTable';
import { studies } from '../../src/music/catalog';
import { libraryPieces } from '../../src/music/libraryView';
import type { Piece } from '../../src/domain/types';

afterEach(cleanup);
const base = studies[0];
const generated: Piece = {
  ...base,
  id: 'generated',
  title: 'Quiet blues',
  subtitle: 'Ada Composer',
  source: 'import',
  bpm: 120,
  tags: ['Blues'],
  origin: {
    source: 'generated',
    name: 'Written for you',
    id: 'prompt',
    licence: 'Generated',
    url: '',
  },
};
it('combines search, source, key and tag filters and clears them', () => {
  render(
    createElement(LibraryTable, {
      pieces: [...studies, generated],
      current: base,
      busy: false,
      onOpen: vi.fn(),
      onRemove: vi.fn(),
    }),
  );
  fireEvent.change(screen.getByLabelText('Search your music'), { target: { value: 'blues ada' } });
  expect(screen.getByRole('button', { name: 'Quiet blues' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Blue hour' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Filter by source'), { target: { value: 'Generated' } });
  fireEvent.change(screen.getByLabelText('Filter by tag'), { target: { value: 'Blues' } });
  fireEvent.change(screen.getByLabelText('Filter by key'), { target: { value: 'E blues' } });
  expect(screen.getByText('No matching music')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(screen.getByRole('button', { name: 'Blue hour' })).toBeTruthy();
});
it('sorts numeric tempo, paginates and resets the page for new searches', () => {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    ...base,
    id: String(i),
    title: `Piece ${i + 1}`,
    bpm: 60 + i,
  }));
  const open = vi.fn();
  render(
    createElement(LibraryTable, {
      pieces,
      current: base,
      busy: false,
      onOpen: open,
      onRemove: vi.fn(),
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'BPM' }));
  fireEvent.click(screen.getByRole('button', { name: 'BPM' }));
  const first = screen.getAllByRole('row')[1];
  fireEvent.click(within(first).getByRole('button', { name: 'Piece 30' }));
  expect(open).toHaveBeenCalledWith(pieces[29]);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Search your music'), { target: { value: 'Piece 30' } });
  expect(screen.getByText('Page 1 of 1')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Piece 30' })).toBeTruthy();
});
it('shows only the latest saved version and excludes exercises', () => {
  const revision = {
    ...generated,
    id: 'v2',
    revision: { familyId: generated.id, number: 2, createdAt: '2026-10-03' },
  };
  expect(libraryPieces([generated, revision, { ...base, source: 'exercise' }])).toEqual([revision]);
});

it('edits descriptions inline, saves with Enter, and cancels names with Escape', () => {
  const describe = vi.fn().mockReturnValue(true);
  const rename = vi.fn().mockReturnValue(true);
  const open = vi.fn();
  render(
    createElement(LibraryTable, {
      pieces: [generated],
      current: base,
      busy: false,
      onOpen: open,
      onRemove: vi.fn(),
      onRename: rename,
      onDescribe: describe,
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A slow duet' } });
  fireEvent.submit(screen.getByLabelText('Description').closest('form')!);
  expect(describe).toHaveBeenCalledWith(generated, 'A slow duet');
  expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit song name' }));
  fireEvent.change(screen.getByLabelText('Song name'), { target: { value: 'Discard me' } });
  fireEvent.keyDown(screen.getByLabelText('Song name'), { key: 'Escape' });
  expect(rename).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox', { name: 'Song name' })).toBeNull();
});
