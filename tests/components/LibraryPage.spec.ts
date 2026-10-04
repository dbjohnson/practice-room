// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryPage } from '../../src/pages/LibraryPage';
import { studies } from '../../src/music/catalog';
import {
  listSources,
  searchSources,
  fetchSourceFile,
  generatePiece,
} from '../../src/app/sourcesClient';

const room = vi.hoisted(() => ({
  library: {
    pieces: [] as unknown[],
    piece: { title: 'New music' },
    busy: false,
    upload: vi.fn(),
    add: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    describe: vi.fn(),
  },
  takes: { recording: false },
  halt: vi.fn(),
  setPage: vi.fn(),
}));
vi.mock('../../src/app/RoomContext', () => ({ useRoom: () => room }));
vi.mock('../../src/app/sourcesClient', () => ({
  listSources: vi.fn(),
  searchSources: vi.fn(),
  fetchSourceFile: vi.fn(),
  generatePiece: vi.fn(),
}));
vi.mock('../../src/app/useGenerationModel', () => ({
  useGenerationModel: () => ({ developer: false }),
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.clearAllMocks();
  room.library.pieces = studies;
  room.library.upload.mockResolvedValue(true);
  room.library.rename.mockReturnValue(true);
  room.library.add.mockImplementation(async (_filename, bytes) => {
    await bytes();
    return true;
  });
  vi.mocked(listSources).mockResolvedValue({ sources: [], generation: true });
  vi.mocked(generatePiece).mockResolvedValue({ alphaTex: ':4 0.6 |' });
});
afterEach(cleanup);
it('imports into the table and opens the player only when requested', async () => {
  render(createElement(LibraryPage));
  expect(listSources).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  const file = new File(['test'], 'song.mid');
  fireEvent.change(screen.getByLabelText('Import Guitar Pro, MusicXML or MIDI'), {
    target: { files: [file] },
  });
  await screen.findByRole('button', { name: 'Open in player' });
  expect(room.library.upload).toHaveBeenCalledWith(file);
  expect(room.setPage).not.toHaveBeenCalled();
  expect(screen.getByRole('table')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open in player' }));
  expect(room.setPage).toHaveBeenCalledWith('practice');
});
it('keeps failed imports in the import flow', async () => {
  room.library.upload.mockResolvedValue(false);
  render(createElement(LibraryPage));
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  fireEvent.change(screen.getByLabelText('Import Guitar Pro, MusicXML or MIDI'), {
    target: { files: [new File(['bad'], 'bad.mid')] },
  });
  await waitFor(() => expect(room.library.upload).toHaveBeenCalledOnce());
  expect(screen.getByRole('heading', { name: 'Import a piece' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Open in player' })).toBeNull();
});
it('adds discoveries and generated music through the same library flow', async () => {
  vi.mocked(searchSources).mockResolvedValue({
    hits: [
      {
        source: 'mutopia',
        id: 'etude',
        title: 'Etude',
        artist: 'Sor',
        format: 'midi',
        licence: 'Public domain',
        open: true,
        detail: '',
        url: 'https://example.test/etude',
      },
    ],
    failed: [],
  });
  vi.mocked(fetchSourceFile).mockResolvedValue(new ArrayBuffer(1));
  render(createElement(LibraryPage));
  fireEvent.click(screen.getByRole('button', { name: 'Discover' }));
  fireEvent.change(await screen.findByLabelText('Search music catalogues'), {
    target: { value: 'Etude' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Add Etude to your library' }));
  await screen.findByRole('button', { name: 'Open in player' });
  expect(room.library.add.mock.lastCall![2]).toMatchObject({ source: 'mutopia', title: 'Etude' });
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  fireEvent.change(await screen.findByLabelText('What you want to practise'), {
    target: { value: 'A blues duet' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Write it' }));
  await waitFor(() => expect(room.library.add).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  expect(room.library.add.mock.lastCall![2]).toMatchObject({ source: 'generated' });
  expect(room.setPage).not.toHaveBeenCalled();
});

it('offers rename and confirmed removal for built-in songs', async () => {
  render(createElement(LibraryPage));
  fireEvent.click(
    screen
      .getAllByRole('button', { name: 'Edit song name' })
      .find((button) => button.closest('tr')?.textContent?.includes('Evening study'))!,
  );
  fireEvent.change(screen.getByLabelText('Song name'), { target: { value: 'My song' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save song name' }));
  expect(room.library.rename).toHaveBeenCalledWith('evening-study', 'My song');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Evening study' }));
  expect(room.library.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove piece' }));
  await waitFor(() => expect(room.library.remove).toHaveBeenCalledWith('evening-study'));
});
