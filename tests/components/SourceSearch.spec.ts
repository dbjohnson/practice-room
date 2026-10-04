// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SourceSearch } from '../../src/components/SourceSearch';
import type { SourceHit } from '../../src/domain/sources';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sources = [
  { id: 'mutopia', name: 'Mutopia Project', note: 'Editions.', ready: true },
  { id: 'pdmx', name: 'PDMX', note: 'Uploads.', ready: false },
];
const hit = (extra: Partial<SourceHit>): SourceHit => ({
  source: 'mutopia',
  id: 'a/b.mid',
  title: 'Etude',
  artist: 'Sor',
  format: 'midi',
  licence: 'Public Domain',
  open: true,
  detail: 'Guitar',
  url: 'https://example.test/piece',
  ...extra,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const search = (text: string) => {
  fireEvent.change(screen.getByLabelText('Search music catalogues'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};

it('shows what each source holds before searching, and which are not installed', () => {
  render(createElement(SourceSearch, { sources, busy: false, onAdd: vi.fn() }));
  expect(screen.getByText('Editions.')).toBeTruthy();
  expect(screen.getByText('Not installed on this server yet.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true);
});

it('adds loadable results with their file and links out for the rest', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        hits: [hit({}), hit({ source: 'songsterr', id: '9', title: 'Riff', format: 'link' })],
        failed: ['BitMidi'],
      }),
    )
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetch);
  const onAdd = vi.fn();
  render(createElement(SourceSearch, { sources, busy: false, onAdd }));
  search('sor etude');
  await screen.findByText('Etude');
  expect(String(fetch.mock.calls[0][0])).toContain('api/sources/search?q=sor%20etude');
  expect(screen.getByText(/No answer from BitMidi/)).toBeTruthy();
  expect(screen.getByText(/Mutopia Project · Public Domain/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe(
    'https://example.test/piece',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add Etude to your library' }));
  const [added, name, filename, bytes] = onAdd.mock.calls[0];
  expect([added.id, name, filename]).toEqual(['a/b.mid', 'Mutopia Project', 'Etude.mid']);
  expect(new Uint8Array(await bytes())).toEqual(new Uint8Array([1, 2, 3]));
  expect(String(fetch.mock.calls[1][0])).toContain('api/sources/file?source=mutopia&id=a%2Fb.mid');
});

it('explains server errors and a missing server in plain words', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ error: 'Type at least two characters to search.' }, 400))
      .mockResolvedValueOnce(new Response('<html>', { headers: { 'content-type': 'text/html' } })),
  );
  render(createElement(SourceSearch, { sources, busy: false, onAdd: vi.fn() }));
  search('ab');
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Type at least two characters to search.',
  );
  search('abc');
  await screen.findByText(
    'The server returned a page instead of data. Reload to restore your session and try again.',
  );
});
