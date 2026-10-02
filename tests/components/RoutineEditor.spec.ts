// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RoutineEditor } from '../../src/components/gym/RoutineEditor';
import { starterExercises } from '../../src/music/exerciseCatalog';
import { defaultTransform, type GymRoutine } from '../../src/domain/gym';
import { expandRoutine } from '../../src/domain/gymPlan';

const saveRoutine = vi.fn((routine: GymRoutine) => routine);
const start = vi.fn();
vi.mock('../../src/app/RoomContext', () => ({
  useRoom: () => ({
    gymStore: { exercises: starterExercises, saveRoutine },
    gym: { start, loading: false },
    notify: vi.fn(),
  }),
}));
vi.mock('../../src/components/Modal', () => ({
  Modal: ({ children }: { children: ReactNode }) =>
    createElement('div', { role: 'dialog' }, children),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const initial: GymRoutine = {
  id: 'routine',
  title: 'Two exercises',
  description: '',
  createdAt: '',
  updatedAt: '',
  blocks: starterExercises.slice(0, 2).map((e, i) => ({
    id: `b${i}`,
    exerciseId: e.id,
    transform: {
      ...defaultTransform(100 + i * 20),
      endBpm: 104 + i * 20,
      keyOrder: 'fourths',
      keyCount: 2,
      repetitions: i === 0 ? 2 : 1,
    },
  })),
};

it('configures whole-routine loops, previews passes, and starts the saved plan', () => {
  const onClose = vi.fn();
  render(createElement(RoutineEditor, { initial, onClose }));
  const outer = within(screen.getByRole('region', { name: 'Routine outer loop' }));
  fireEvent.click(outer.getByRole('checkbox', { name: 'Routine tempo ladder' }));
  fireEvent.change(outer.getByLabelText('Start BPM'), { target: { value: '80' } });
  fireEvent.change(outer.getByLabelText('Target BPM'), { target: { value: '90' } });
  fireEvent.change(outer.getByLabelText('BPM step'), { target: { value: '10' } });
  fireEvent.click(outer.getByRole('checkbox', { name: 'Routine key modulation' }));
  fireEvent.change(outer.getByLabelText('Number of keys'), { target: { value: '2' } });
  expect(screen.getByText('12 sets')).toBeTruthy();
  expect(screen.getAllByText('Tempo follows the routine ladder.')).toHaveLength(2);
  expect(screen.getAllByText('Key follows the routine modulation.')).toHaveLength(2);
  expect(screen.getByText(/Pass 2 · Dorian groove · A · 80 BPM/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save & start' }));
  const saved = saveRoutine.mock.calls[0][0];
  expect(saved.outerLoop).toEqual({
    tempo: { startBpm: 80, endBpm: 90, bpmStep: 10 },
    keys: { keyOrder: 'fifths', keyCount: 2 },
  });
  expect(saved.blocks).toEqual(initial.blocks);
  expect(expandRoutine(saved, starterExercises)).toHaveLength(12);
  expect(start).toHaveBeenCalledWith(saved);
  expect(onClose).toHaveBeenCalledOnce();
});

it('restores block controls when routine loops are disabled without changing their settings', () => {
  render(
    createElement(RoutineEditor, {
      initial: {
        ...initial,
        outerLoop: {
          tempo: { startBpm: 80, endBpm: 90, bpmStep: 10 },
          keys: { keyOrder: 'chromatic', keyCount: 3 },
        },
      },
      onClose: vi.fn(),
    }),
  );
  const outer = within(screen.getByRole('region', { name: 'Routine outer loop' }));
  fireEvent.click(outer.getByRole('checkbox', { name: 'Routine tempo ladder' }));
  fireEvent.click(outer.getByRole('checkbox', { name: 'Routine key modulation' }));
  expect(screen.getAllByLabelText('Start BPM').map((e) => (e as HTMLInputElement).value)).toEqual([
    '100',
    '120',
  ]);
  expect(
    screen.getAllByLabelText('Key journey').map((e) => (e as HTMLSelectElement).value),
  ).toEqual(['fourths', 'fourths']);
  fireEvent.click(screen.getByRole('button', { name: 'Save routine' }));
  expect(saveRoutine.mock.calls[0][0].blocks).toEqual(initial.blocks);
});

it('prevents saving invalid routine ladders and oversized multiplied queues', () => {
  render(createElement(RoutineEditor, { initial, onClose: vi.fn() }));
  const outer = within(screen.getByRole('region', { name: 'Routine outer loop' }));
  fireEvent.click(outer.getByRole('checkbox', { name: 'Routine tempo ladder' }));
  fireEvent.change(outer.getByLabelText('Target BPM'), { target: { value: '80' } });
  expect((screen.getByRole('button', { name: 'Save routine' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByRole('status').textContent).toContain('target tempo');
  fireEvent.change(outer.getByLabelText('Target BPM'), { target: { value: '240' } });
  fireEvent.change(outer.getByLabelText('BPM step'), { target: { value: '1' } });
  fireEvent.click(outer.getByRole('checkbox', { name: 'Routine key modulation' }));
  expect(screen.getByRole('status').textContent).toContain('240 sets');
  expect((screen.getByRole('button', { name: 'Save & start' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
