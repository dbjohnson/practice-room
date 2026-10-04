// @vitest-environment jsdom
import { createElement, Fragment } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PieceVersionSelect } from '../../src/components/PieceVersionSelect';
import { ScoreChat } from '../../src/components/ScoreChat';
import { createScore } from '../../src/music/createScore';
import { studies } from '../../src/music/catalog';
import { defaultGenerationModel } from '../../src/domain/generation';
import type { useRoomState } from '../../src/app/useRoomState';

let room: ReturnType<typeof useRoomState>;
vi.mock('../../src/app/RoomContext', () => ({ useRoom: () => room }));
declare const jsdom: { window: Window };
beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  const piece = {
    ...studies[0],
    revision: { familyId: 'family', number: 1, createdAt: '2026-10-03' },
  };
  room = {
    library: {
      pieces: [piece],
      piece,
      score: createScore(studies[0], studies[0].recipe!),
      busy: false,
      revise: vi.fn(async (_score, _prompt, _model, compose) => {
        await compose();
        return true;
      }),
      select: vi.fn(async () => true),
    },
    takes: { recording: false },
    track: 0,
    halt: vi.fn(),
  } as unknown as ReturnType<typeof useRoomState>;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
it('sends the current score with the edit, saves a version and clears the draft on success', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async (url) =>
      String(url).endsWith('/generate') ? json({ alphaTex: ':4 0.6 |' }) : json({ models: [] }),
    );
  vi.stubGlobal('fetch', fetcher);
  render(createElement(ScoreChat, { onClose: vi.fn() }));
  fireEvent.change(screen.getByLabelText('Edit instructions'), {
    target: { value: 'Add a walking bass line' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save a new version' }));
  await waitFor(() =>
    expect((screen.getByLabelText('Edit instructions') as HTMLTextAreaElement).value).toBe(''),
  );
  const [, init] = fetcher.mock.calls.find(([url]) => String(url).endsWith('/generate'))!;
  const input = JSON.parse(init.body);
  expect(input).toMatchObject({ prompt: 'Add a walking bass line', model: defaultGenerationModel });
  expect(input.currentScore).toContain('Grand piano');
  expect(input.currentScore).toContain('Studio drums');
  expect(room.halt).toHaveBeenCalled();
  expect(room.library.revise).toHaveBeenCalledOnce();
});
it('shows failures without losing the requested edit', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ models: [] })));
  vi.mocked(room.library.revise).mockRejectedValueOnce(new Error('Could not save this score.'));
  render(createElement(ScoreChat, { onClose: vi.fn() }));
  fireEvent.change(screen.getByLabelText('Edit instructions'), {
    target: { value: 'Make it slower' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save a new version' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Could not save this score.',
  );
  expect((screen.getByLabelText('Edit instructions') as HTMLTextAreaElement).value).toBe(
    'Make it slower',
  );
});
it('opens previous versions and blocks edits while recording', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => json({ models: [] })),
  );
  const original = room.library.piece;
  room.library.piece = {
    ...original,
    id: 'new',
    revision: { ...original.revision!, number: 2, parentId: original.id, prompt: 'Make it slower' },
  };
  room.library.pieces.push(room.library.piece);
  const content = () =>
    createElement(
      Fragment,
      null,
      createElement(PieceVersionSelect),
      createElement(ScoreChat, { onClose: vi.fn() }),
    );
  const view = render(content());
  fireEvent.change(screen.getByLabelText('Piece version'), { target: { value: original.id } });
  expect(room.library.select).toHaveBeenCalledWith(original);
  room.takes.recording = true;
  view.rerender(content());
  expect((screen.getByLabelText('Edit instructions') as HTMLTextAreaElement).disabled).toBe(true);
  await act(async () => {});
});

it('submits on Enter and clears the box before the request completes, while Shift+Enter and composition do not submit', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ models: [] })));
  let finish!: (saved: boolean) => void;
  vi.mocked(room.library.revise).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(createElement(ScoreChat, { onClose: vi.fn() }));
  const input = screen.getByLabelText('Edit instructions') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: 'Make it simpler' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(room.library.revise).not.toHaveBeenCalled();
  expect(input.value).toBe('Make it simpler');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(room.library.revise).toHaveBeenCalledOnce();
  expect(input.value).toBe('');
  expect(screen.getByText('Make it simpler')).toBeTruthy();
  await act(async () => finish(true));
});
