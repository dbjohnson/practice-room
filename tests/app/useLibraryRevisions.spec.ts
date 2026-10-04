// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLibrary } from '../../src/app/useLibrary';
import { studies } from '../../src/music/catalog';
import { storeScores, readScore, removeScores } from '../../src/storage/library';
import { generationReceipts, rememberGeneration } from '../../src/storage/generationReceipts';
import { resumeGeneration } from '../../src/app/sourcesClient';
import { editableScore } from '../../src/music/scoreRevision';
import { createScore } from '../../src/music/createScore';
import { writeLocal, loadPieces } from '../../src/storage/library';
import { pieceVersions } from '../../src/domain/revisions';

vi.mock('../../src/app/sourcesClient', () => ({ resumeGeneration: vi.fn() }));
vi.mock('../../src/storage/library', async (original) => ({
  ...(await original<typeof import('../../src/storage/library')>()),
  storeScores: vi.fn(),
  readScore: vi.fn(),
  removeScores: vi.fn(),
}));
declare const jsdom: { window: Window };
const files = new Map<string, ArrayBuffer>();
const tex = '\\title "Changed"\n\\tempo 80\n:4 0.6 3.6 5.6 3.6 |';
beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  vi.stubGlobal('crypto', webcrypto);
  localStorage.clear();
  files.clear();
  vi.clearAllMocks();
  vi.mocked(storeScores).mockImplementation(async (buffers) => {
    for (const { id, buffer } of buffers) files.set(id, buffer);
  });
  vi.mocked(readScore).mockImplementation(async (id) => files.get(id));
  vi.mocked(removeScores).mockImplementation(async (ids) => {
    ids.forEach((id) => files.delete(id));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('persists versions across reload, restores the original and deletes the whole family', async () => {
  const first = renderHook(() => useLibrary(vi.fn()));
  await act(async () => {
    await first.result.current.revise(
      first.result.current.score,
      'Simplify it',
      'test/model',
      async () => tex,
    );
  });
  const latest = first.result.current.piece;
  const versions = pieceVersions(first.result.current.pieces, latest);
  expect(versions).toHaveLength(2);
  expect(first.result.current.score.title).toBe('Changed');
  first.unmount();
  const next = renderHook(() => useLibrary(vi.fn()));
  expect(pieceVersions(next.result.current.pieces, latest)).toHaveLength(2);
  await act(async () => {
    await next.result.current.select(versions[0]);
  });
  expect(next.result.current.score.masterBars.length).toBe(studies[0].bars);
  await act(async () => {
    await next.result.current.select(latest);
  });
  expect(next.result.current.score.title).toBe('Changed');
  await act(async () => {
    await next.result.current.remove(latest.id);
  });
  expect(pieceVersions(next.result.current.pieces, latest)).toHaveLength(0);
  expect(files.size).toBe(0);
});
it('saves an edit in the background without replacing another selected piece', async () => {
  const { result } = renderHook(() => useLibrary(vi.fn()));
  let finish!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  let editing!: Promise<boolean>;
  act(() => {
    editing = result.current.revise(
      result.current.score,
      'Simplify it',
      'test/model',
      () => pending,
    );
  });
  await act(async () => {
    await result.current.select(studies[1]);
  });
  await act(async () => {
    finish(tex);
    expect(await editing).toBe(true);
  });
  expect(result.current.piece.id).toBe(studies[1].id);
  expect(storeScores).toHaveBeenCalledOnce();
  expect(result.current.editRequests[0]).toMatchObject({ prompt: 'Simplify it', status: 'saved' });
});
it('leaves the current score and prior versions alone when saving fails', async () => {
  vi.mocked(storeScores).mockRejectedValueOnce(new Error('Storage full'));
  const { result } = renderHook(() => useLibrary(vi.fn()));
  const score = result.current.score;
  await act(async () => {
    await expect(
      result.current.revise(score, 'Simplify it', 'test/model', async () => tex),
    ).rejects.toThrow('Storage full');
  });
  expect(result.current.score).toBe(score);
  expect(result.current.pieces).toHaveLength(studies.length);
  expect(result.current.busy).toBe(false);
});

it('does not report a saved version when the history metadata cannot be persisted', async () => {
  const { result } = renderHook(() => useLibrary(vi.fn()));
  const original = result.current.piece;
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  });
  await act(async () => {
    await expect(
      result.current.revise(result.current.score, 'Simplify', 'test/model', async () => tex),
    ).rejects.toThrow('edit request');
  });
  expect(result.current.piece).toBe(original);
  expect(result.current.pieces).toHaveLength(studies.length);
});

it('removes built-in songs persistently, including the last one, without deleting score files', async () => {
  const first = renderHook(() => useLibrary(vi.fn()));
  for (const study of studies) {
    await act(async () => first.result.current.remove(study.id));
    expect(first.result.current.pieces.some((piece) => piece.id === study.id)).toBe(false);
  }
  expect(first.result.current.empty).toBe(true);
  expect(removeScores).not.toHaveBeenCalled();
  first.unmount();
  const next = renderHook(() => useLibrary(vi.fn()));
  expect(next.result.current.pieces).toEqual([]);
  expect(next.result.current.empty).toBe(true);
});

it('renames built-in songs persistently without changing their IDs or notation', () => {
  const first = renderHook(() => useLibrary(vi.fn()));
  const id = first.result.current.piece.id;
  const bars = first.result.current.score.masterBars.length;
  act(() => expect(first.result.current.rename(id, '  My study  ')).toBe(true));
  expect(first.result.current.piece).toMatchObject({ id, title: 'My study' });
  expect(first.result.current.score.title).toBe('My study');
  expect(first.result.current.score.masterBars).toHaveLength(bars);
  first.unmount();
  const next = renderHook(() => useLibrary(vi.fn()));
  expect(next.result.current.piece.title).toBe('My study');
  expect(next.result.current.pieces.find((piece) => piece.id === id)?.title).toBe('My study');
  expect(studies[0].title).toBe('Evening study');
});

it('renames every version and uses that name when an original score is reopened', async () => {
  const first = renderHook(() => useLibrary(vi.fn()));
  await act(async () => {
    await first.result.current.revise(
      first.result.current.score,
      'Change',
      'test/model',
      async () => tex,
    );
  });
  const id = first.result.current.piece.id;
  act(() => expect(first.result.current.rename(id, 'My blues')).toBe(true));
  const versions = pieceVersions(first.result.current.pieces, first.result.current.piece);
  expect(versions.every((piece) => piece.title === 'My blues')).toBe(true);
  first.unmount();
  const next = renderHook(() => useLibrary(vi.fn()));
  await act(async () => {
    await next.result.current.select(versions[0]);
  });
  expect(next.result.current.piece.title).toBe('My blues');
  expect(next.result.current.score.title).toBe('My blues');
});

it('rejects empty names and preserves the song if its library edits cannot be saved', async () => {
  const { result } = renderHook(() => useLibrary(vi.fn()));
  const original = result.current.piece;
  act(() => expect(result.current.rename(original.id, '  ')).toBe(false));
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Full');
  });
  act(() => expect(result.current.rename(original.id, 'Lost name')).toBe(false));
  await act(async () => result.current.remove(original.id));
  expect(result.current.piece.title).toBe(original.title);
  expect(result.current.pieces.some((piece) => piece.id === original.id)).toBe(true);
  fail.mockRestore();
});

it('retrieves a completed edit after reopening and saves its version without another model request', async () => {
  const id = 'aa000000-0000-4000-8000-000000000001';
  rememberGeneration({
    id,
    source: studies[0],
    input: {
      prompt: 'Simplify it',
      instrument: 'guitar',
      level: 'beginner',
      model: 'test/model',
      currentScore: editableScore(createScore(studies[0], studies[0].recipe!)),
    },
  });
  writeLocal('edit-requests', [
    { id, familyId: studies[0].id, prompt: 'Simplify it', model: 'test/model', status: 'working' },
  ]);
  vi.mocked(resumeGeneration).mockResolvedValue({ alphaTex: tex });
  const first = renderHook(() => useLibrary(vi.fn()));
  await waitFor(() =>
    expect(first.result.current.pieces.some((piece) => piece.id === `version-${id}`)).toBe(true),
  );
  expect(first.result.current.piece.id).toBe(studies[0].id);
  expect(first.result.current.editRequests[0]).toMatchObject({
    status: 'saved',
    versionId: `version-${id}`,
  });
  expect(generationReceipts()).toEqual([]);
  first.unmount();
  const next = renderHook(() => useLibrary(vi.fn()));
  expect(next.result.current.pieces.filter((piece) => piece.id === `version-${id}`)).toHaveLength(
    1,
  );
  expect(resumeGeneration).toHaveBeenCalledOnce();
});

it('persists descriptions including an empty description across reopening and selection', async () => {
  const first = renderHook(() => useLibrary(vi.fn()));
  const id = first.result.current.piece.id;
  act(() => expect(first.result.current.describe(id, '  Slow blues practice  ')).toBe(true));
  expect(first.result.current.piece.subtitle).toBe('Slow blues practice');
  first.unmount();
  const next = renderHook(() => useLibrary(vi.fn()));
  expect(next.result.current.piece.subtitle).toBe('Slow blues practice');
  await act(async () => {
    await next.result.current.select(studies[0]);
  });
  expect(next.result.current.piece.subtitle).toBe('Slow blues practice');
  act(() => expect(next.result.current.describe(id, '')).toBe(true));
  next.unmount();
  const reopened = renderHook(() => useLibrary(vi.fn()));
  expect(reopened.result.current.piece.subtitle).toBe('');
});

it('repairs existing Imported keys from saved notation before the song is opened', async () => {
  const piece = { ...studies[0], id: 'old-import', source: 'import' as const, key: 'Imported' };
  writeLocal('library', [piece]);
  files.set(
    piece.id,
    new TextEncoder().encode('\\title "Minor blues"\n\\ks eminor :4 0.6 3.6 5.6 3.6 |').buffer,
  );
  const view = renderHook(() => useLibrary(vi.fn()));
  await waitFor(() =>
    expect(view.result.current.pieces.find((item) => item.id === piece.id)?.key).toBe('E minor'),
  );
  expect(view.result.current.piece.id).toBe(studies[0].id);
  expect(loadPieces().find((item) => item.id === piece.id)?.key).toBe('E minor');
});

it('keeps an old generation failure in chat without showing a global notification on reopen', async () => {
  const id = 'aa000000-0000-4000-8000-000000000002';
  rememberGeneration({
    id,
    source: studies[0],
    input: { prompt: 'Make it melodic', instrument: 'guitar', level: 'beginner' },
  });
  writeLocal('edit-requests', [
    {
      id,
      familyId: studies[0].id,
      prompt: 'Make it melodic',
      model: 'test/model',
      status: 'failed',
      error: 'An old error',
    },
  ]);
  const message =
    'The server connection timed out or was interrupted (HTTP 502). Please try again.';
  vi.mocked(resumeGeneration).mockRejectedValue(new Error(message));
  const notify = vi.fn();
  const first = renderHook(() => useLibrary(notify));
  await waitFor(() =>
    expect(first.result.current.editRequests[0]).toMatchObject({
      status: 'failed',
      error: message,
    }),
  );
  expect(notify).not.toHaveBeenCalled();
  first.unmount();
  const reopened = renderHook(() => useLibrary(notify));
  await waitFor(() => expect(reopened.result.current.editRequests[0].status).toBe('failed'));
  expect(notify).not.toHaveBeenCalled();
});
