// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RoomContext } from '../../src/app/RoomContext';
import { useRoomState } from '../../src/app/useRoomState';
import { Mixer } from '../../src/components/Mixer';
import { ScoreToolbar } from '../../src/components/ScoreToolbar';

declare const jsdom: { window: Window };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Workspace() {
  const room = useRoomState();
  return createElement(
    RoomContext.Provider,
    {
      value: {
        ...room,
        exerciseLoop: { ...room.exerciseLoop, active: true },
        takes: { ...room.takes, recording: true },
      },
    },
    createElement(Mixer),
    createElement(ScoreToolbar),
  );
}
it('keeps mute, solo and levels usable while recording a loop, with no playback mode buttons', () => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  render(createElement(Workspace));
  expect(screen.queryByRole('group', { name: 'Playback mode' })).toBeNull();
  const volume = screen.getAllByRole('slider')[0] as HTMLInputElement;
  expect(volume.disabled).toBe(false);
  fireEvent.change(volume, { target: { value: '42' } });
  expect(volume.value).toBe('42');
  const metronome = screen.getByRole('slider', { name: 'Metronome volume' }) as HTMLInputElement;
  expect(metronome.disabled).toBe(false);
  fireEvent.change(metronome, { target: { value: '30' } });
  expect(metronome.value).toBe('30');
  const mute = screen.getAllByRole('button', { name: /^Mute / })[0] as HTMLButtonElement;
  expect(mute.disabled).toBe(false);
  fireEvent.click(mute);
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  const solos = screen.getAllByRole('button', { name: /^Solo / });
  fireEvent.click(solos[1]);
  expect(solos[1].getAttribute('aria-pressed')).toBe('true');
  expect(solos[0].closest('.mixer-track')?.classList.contains('is-muted')).toBe(true);
  expect(solos[1].closest('.mixer-track')?.classList.contains('is-muted')).toBe(false);
  fireEvent.click(solos[1]);
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(mute);
  expect(mute.getAttribute('aria-pressed')).toBe('false');
});

it('solo clears the same track’s mute and mute clears its solo', () => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  render(createElement(Workspace));
  const mute = screen.getAllByRole('button', { name: /^Mute / })[0];
  const solo = screen.getAllByRole('button', { name: /^Solo / })[0];
  fireEvent.click(mute);
  fireEvent.click(solo);
  expect(mute.getAttribute('aria-pressed')).toBe('false');
  expect(solo.getAttribute('aria-pressed')).toBe('true');
  expect(solo.closest('.mixer-track')?.classList.contains('is-muted')).toBe(false);
  fireEvent.click(mute);
  expect(mute.getAttribute('aria-pressed')).toBe('true');
  expect(solo.getAttribute('aria-pressed')).toBe('false');
});

it('moves exclusive solo between tracks and groups the compact M/S buttons', () => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
  render(createElement(Workspace));
  const solos = screen.getAllByRole('button', { name: /^Solo / });
  fireEvent.click(solos[0]);
  fireEvent.click(solos[1]);
  expect(solos[0].getAttribute('aria-pressed')).toBe('false');
  expect(solos[1].getAttribute('aria-pressed')).toBe('true');
  expect(solos[0].closest('.mixer-track')?.classList.contains('is-muted')).toBe(true);
  const group = solos[1].closest('[role="group"]')!;
  expect([...group.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
    'M',
    'S',
  ]);
  fireEvent.click(solos[1]);
  expect(screen.queryByRole('button', { name: /^Unsolo / })).toBeNull();
});
