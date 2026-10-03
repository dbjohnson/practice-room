// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SlidersHorizontal } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { PracticeTool } from '../../src/components/PracticeTool';

afterEach(cleanup);
function open() {
  const view = render(
    createElement(
      'div',
      null,
      createElement('button', null, 'Elsewhere'),
      createElement(PracticeTool, {
        label: 'Mixer',
        Icon: SlidersHorizontal,
        children: createElement('button', null, 'Mute bass'),
      }),
    ),
  );
  const details = view.container.querySelector('details')!;
  act(() => {
    details.open = true;
    fireEvent(details, new Event('toggle'));
  });
  expect(screen.getByText('Mute bass')).toBeTruthy();
  // jsdom does not fire toggle when a script closes the panel, as browsers do.
  const settle = () => act(() => void fireEvent(details, new Event('toggle')));
  return { details, settle };
}
const pointerDown = (target: Element) =>
  act(() => void fireEvent(target, new Event('pointerdown', { bubbles: true })));

it('stays open while its own controls are used', () => {
  const { details } = open();
  pointerDown(screen.getByText('Mute bass'));
  pointerDown(details.querySelector('summary')!);
  expect(details.open).toBe(true);
});

it('closes when the player clicks anywhere outside it', () => {
  const { details, settle } = open();
  pointerDown(screen.getByText('Elsewhere'));
  expect(details.open).toBe(false);
  settle();
  expect(screen.queryByText('Mute bass')).toBeNull();
});

it('closes on Escape and returns focus to its button', () => {
  const { details, settle } = open();
  screen.getByText('Mute bass').focus();
  act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(details.querySelector('summary'));
  settle();
  // Once closed it no longer listens, so other handlers see later keys untouched.
  act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
  expect(details.open).toBe(false);
});

it('leaves Escape to a dialog that is open above it', () => {
  const { details } = open();
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  document.body.append(dialog);
  act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
  expect(details.open).toBe(true);
  dialog.remove();
});
