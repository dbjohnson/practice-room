// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Transport } from '../../src/components/Transport';

const room = {
  gymRunMatches: true,
  gym: { rest: 0 },
  takes: { recording: false, passResult: null, audio: { processing: false } },
  takePlayback: { active: false },
  preparingReplay: false,
  exerciseLoop: { active: false, preparing: false },
  player: { ready: true, playing: false },
  library: { piece: { bars: 4, gymSet: {} } },
  range: { start: 2, end: 3 },
  tempo: 90,
  loop: false,
  mode: 'along',
  click: true,
  countIn: true,
  setRange: vi.fn(),
  setLoop: vi.fn(),
  play: vi.fn(),
  restart: vi.fn(),
  setTempo: vi.fn(),
};
vi.mock('../../src/app/RoomContext', () => ({ useRoom: () => room }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('keeps loop, tempo, restart and passage controls available during capture', () => {
  const { rerender } = render(createElement(Transport));
  const repeat = screen.getByRole('button', { name: 'Loop full exercise' }) as HTMLButtonElement;
  expect(repeat.disabled).toBe(false);
  fireEvent.click(repeat);
  expect(room.setRange).toHaveBeenCalledExactlyOnceWith({ start: 1, end: 4 });
  expect(room.setLoop).toHaveBeenCalledExactlyOnceWith(true);
  room.takes.recording = true;
  rerender(createElement(Transport));
  expect(repeat.disabled).toBe(false);
  for (const name of ['Restart passage', 'Increase tempo', 'Decrease tempo'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(false);
  expect(
    (screen.getByRole('combobox', { name: 'Loop start measure' }) as HTMLSelectElement).disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Increase tempo' }));
  expect(room.setTempo).toHaveBeenCalledWith(94);
  fireEvent.click(screen.getByRole('button', { name: 'Restart passage' }));
  expect(room.restart).toHaveBeenCalledOnce();
});
