// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomState } from '../../src/app/useRoomState';
import { useRoomNavigation } from '../../src/app/useRoomNavigation';
import { readScore, writeLocal } from '../../src/storage/library';
import { studies } from '../../src/music/catalog';

vi.mock('../../src/storage/library', async (original) => ({
  ...(await original<typeof import('../../src/storage/library')>()),
  readScore: vi.fn(),
}));
declare const jsdom: { window: Window };
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
function useNavigableRoom() {
  const room = useRoomState();
  useRoomNavigation(room);
  return room;
}
function visit(hash: string) {
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('room navigation history', () => {
  it('opens a legacy concept link with its song, section, instrument and notation view', async () => {
    window.history.replaceState(
      null,
      '',
      '#song=blue-hour&section=library&concept=pocket&part=1&view=tab&zoom=150&transpose=3',
    );
    const { result } = renderHook(useNavigableRoom, { reactStrictMode: true });
    await flush();
    expect(result.current.library.piece.id).toBe('blue-hour');
    expect(result.current).toMatchObject({
      page: 'library',
      track: 1,
      view: 'tab',
      zoom: 150,
      transpose: 3,
    });
    expect(window.location.hash).toContain('song=blue-hour');
    expect(window.location.hash).not.toContain('concept=');
  });

  it('writes UI changes once and restores a browser history entry without adding another', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { result } = renderHook(useNavigableRoom);
    await flush();
    const initial = window.location.hash;
    act(() => {
      result.current.setTrack(1);
      result.current.setView('score');
      result.current.setZoom(130);
      result.current.setTranspose(-2);
    });
    await flush();
    const selected = window.location.hash;
    expect(selected).toContain('part=1&view=score&zoom=130&transpose=-2');
    expect(push).toHaveBeenCalledTimes(1);
    act(() => result.current.setPage('instrument'));
    await flush();
    expect(window.location.hash).toContain('section=instrument');
    act(() => visit(initial));
    await flush();
    expect(result.current).toMatchObject({
      page: 'practice',
      track: 0,
      view: 'both',
      zoom: 100,
      transpose: 0,
    });
    act(() => visit(selected));
    await flush();
    expect(result.current).toMatchObject({ track: 1, view: 'score', zoom: 130, transpose: -2 });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('writes a newly selected song and keeps browser navigation authoritative over slow imports', async () => {
    writeLocal('library', [{ ...studies[0], id: 'saved-import', source: 'import' }]);
    let resolve: (value: ArrayBuffer | undefined) => void = () => {};
    vi.mocked(readScore).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(useNavigableRoom);
    await flush();
    await act(async () => {
      await result.current.library.select(studies[1]);
      result.current.setPage('practice');
    });
    await flush();
    expect(window.location.hash).toContain('song=blue-hour');
    act(() => visit('#song=saved-import&section=practice'));
    await flush();
    expect(result.current.library.busy).toBe(true);
    act(() => visit('#song=first-light&section=library'));
    await flush();
    await act(async () => resolve(new ArrayBuffer(1)));
    await flush();
    expect(result.current.library.piece.id).toBe('first-light');
    expect(result.current.page).toBe('library');
    expect(result.current.library.busy).toBe(false);
    expect(window.location.hash).toContain('song=first-light');
  });

  it('falls back for unavailable songs and clamps an unavailable instrument', async () => {
    window.history.replaceState(null, '', '#song=not-on-this-device&part=999&section=bogus');
    const { result } = renderHook(useNavigableRoom);
    await flush();
    expect(result.current.library.piece.id).toBe('evening-study');
    expect(result.current.track).toBe(3);
    expect(result.current.page).toBe('practice');
    expect(result.current.toast).toContain('not in this browser');
    expect(window.location.hash).toContain('song=evening-study');
  });
});

it('opens an empty library instead of restoring deleted built-in music', async () => {
  writeLocal(
    'library-edits',
    Object.fromEntries(studies.map((piece) => [piece.id, { removed: true }])),
  );
  const { result } = renderHook(useNavigableRoom);
  await flush();
  expect(result.current.page).toBe('library');
  expect(result.current.library.empty).toBe(true);
  expect(result.current.library.pieces.some((piece) => piece.source === 'study')).toBe(false);
});
