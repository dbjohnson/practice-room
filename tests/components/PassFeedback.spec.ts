// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PassFeedback } from '../../src/components/PassFeedback';

const take = { pieceId: 'exercise', pass: 1, pitchAccuracy: 98, timingScore: 95, coverage: 100 };
const room = {
  library: { piece: { id: 'exercise' } },
  player: { playing: true },
  takes: { passResult: take, recording: true, setReview: vi.fn() },
};
vi.mock('../../src/app/RoomContext', () => ({ useRoom: () => room }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('shows first-pass pitch and timing inline and opens review only after stopping and asking for it', () => {
  const { rerender } = render(createElement(PassFeedback));
  const feedback = screen.getByRole('status', { name: 'Pass accuracy' });
  expect(feedback.textContent).toContain('Pass 1');
  expect(feedback.textContent).toContain('Pitch 98%');
  expect(feedback.textContent).toContain('Timing 95%');
  expect(feedback.textContent).toContain('Live estimate');
  expect(screen.queryByRole('dialog')).toBeNull();
  const review = screen.getByRole('button', { name: 'Review' }) as HTMLButtonElement;
  expect(review.disabled).toBe(true);
  expect(room.takes.setReview).not.toHaveBeenCalled();
  room.player.playing = false;
  room.takes.recording = false;
  rerender(createElement(PassFeedback));
  fireEvent.click(review);
  expect(room.takes.setReview).toHaveBeenCalledExactlyOnceWith(take);
  room.library.piece.id = 'other';
  rerender(createElement(PassFeedback));
  expect(screen.queryByRole('status')).toBeNull();
});
