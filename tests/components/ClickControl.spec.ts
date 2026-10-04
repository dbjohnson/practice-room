// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClickControl } from '../../src/components/ClickControl';
const room = {
  click: true,
  clickVolume: 55,
  setClickVolume: vi.fn(),
  setClick: vi.fn(),
  flash: false,
  setFlash: vi.fn(),
  player: { playing: true, beatAt: 1000 },
  takes: { recording: true },
};
vi.mock('../../src/app/RoomContext', () => ({ useRoom: () => room }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('toggles the metronome and score flash independently during recording', () => {
  const { rerender } = render(createElement(ClickControl));
  const click = screen.getByRole('button', { name: 'Metronome click' }) as HTMLButtonElement;
  const flash = screen.getByRole('button', { name: 'Score flash' }) as HTMLButtonElement;
  expect(click.disabled).toBe(false);
  expect(flash.disabled).toBe(false);
  expect(click.getAttribute('aria-pressed')).toBe('true');
  expect(flash.getAttribute('aria-pressed')).toBe('false');
  expect(click.textContent).toBe('');
  expect(flash.textContent).toBe('');
  expect(screen.queryByRole('slider', { name: 'Metronome volume' })).toBeNull();
  fireEvent.click(flash);
  expect(room.setFlash).toHaveBeenCalledExactlyOnceWith(true);
  expect(room.setClick).not.toHaveBeenCalled();
  fireEvent.click(click);
  expect(room.setClick).toHaveBeenCalledExactlyOnceWith(false);
  room.click = false;
  room.flash = true;
  rerender(createElement(ClickControl));
  expect(click.getAttribute('aria-pressed')).toBe('false');
  expect(flash.getAttribute('aria-pressed')).toBe('true');
});
