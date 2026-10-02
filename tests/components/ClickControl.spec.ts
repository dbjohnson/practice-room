// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClickControl } from '../../src/components/ClickControl';
const room = {
  click: true,
  setClick: vi.fn(),
  player: { playing: true, beatAt: 1000 },
  takes: { recording: true },
};
vi.mock('../../src/app/RoomContext', () => ({ useRoom: () => room }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('keeps click enabled during recording and flashes on clock updates even when audio is muted', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1020);
  const { rerender } = render(createElement(ClickControl));
  const button = screen.getByRole('button', { name: 'Click' }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(button);
  expect(room.setClick).toHaveBeenCalledExactlyOnceWith(false);
  const first = button.querySelector('.is-beating') as HTMLElement;
  expect(first.style.animationDelay).toBe('-20ms');
  room.click = false;
  room.player.beatAt = 1500;
  vi.mocked(performance.now).mockReturnValue(1510);
  rerender(createElement(ClickControl));
  const second = button.querySelector('.is-beating') as HTMLElement;
  expect(second).not.toBe(first);
  expect(second.style.animationDelay).toBe('-10ms');
  expect(button.getAttribute('aria-pressed')).toBe('false');
  room.player.playing = false;
  rerender(createElement(ClickControl));
  expect(button.querySelector('.is-beating')).toBeNull();
});
