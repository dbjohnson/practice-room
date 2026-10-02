// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGymStore } from '../../src/app/useGymStore';
import { readGym, writeGym } from '../../src/storage/gym';
import { emptyGym } from '../../src/domain/gym';
import { starterExercises } from '../../src/music/exerciseCatalog';
vi.mock('../../src/storage/gym', () => ({
  readGym: vi.fn(),
  writeGym: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('gym library storage', () => {
  it('hydrates before writes and serializes edits without losing the newest change', async () => {
    vi.mocked(readGym).mockResolvedValue(emptyGym());
    let finish: () => void = () => {};
    vi.mocked(writeGym).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useGymStore(vi.fn()), { reactStrictMode: true });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(writeGym).not.toHaveBeenCalled();
    const e = { ...starterExercises[0], id: 'own', builtin: false };
    act(() => {
      result.current.saveExercise(e);
      result.current.saveExercise({ ...e, title: 'Newest title' });
    });
    await waitFor(() => expect(writeGym).toHaveBeenCalledTimes(1));
    await act(async () => {
      finish();
    });
    await waitFor(() => expect(writeGym).toHaveBeenCalledTimes(2));
    expect(vi.mocked(writeGym).mock.calls[1][0].exercises[0].title).toBe('Newest title');
    expect(result.current.exercises.filter((x) => x.id === 'own')).toHaveLength(1);
  });
  it('does not overwrite an unread library after an IndexedDB failure', async () => {
    vi.mocked(readGym).mockRejectedValue(new Error('unavailable'));
    const { result } = renderHook(() => useGymStore(vi.fn()));
    await waitFor(() => expect(result.current.error).toContain('Could not read'));
    expect(result.current.ready).toBe(false);
    act(() => result.current.commit(() => emptyGym()));
    expect(writeGym).not.toHaveBeenCalled();
  });
  it('keeps data and exposes retry when saving fails', async () => {
    vi.mocked(readGym).mockResolvedValue(emptyGym());
    vi.mocked(writeGym).mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(() => useGymStore(vi.fn()));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.saveExercise({ ...starterExercises[0], id: 'own', builtin: false }));
    await waitFor(() => expect(result.current.error).toContain('could not be saved'));
    expect(result.current.data.exercises).toHaveLength(1);
    act(() => result.current.retrySave());
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});

it('keeps speed records comparable after renaming or changing default tempo, but versions changed notes', async () => {
  vi.mocked(readGym).mockResolvedValue(emptyGym());
  const { result } = renderHook(() => useGymStore(vi.fn()));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const exercise = { ...starterExercises[0], id: 'own', builtin: false };
  act(() => result.current.saveExercise(exercise));
  act(() =>
    result.current.saveExercise({
      ...exercise,
      title: 'Faster goal',
      defaults: { ...exercise.defaults, tempo: 120 },
    }),
  );
  expect(result.current.data.exercises[0].revision).toBe(1);
  act(() =>
    result.current.saveExercise({
      ...exercise,
      source: {
        ...exercise.source,
        kind: 'scale',
        scaleId: 'dorian',
        key: 0,
        octaves: 2,
        direction: 'ascending',
        pattern: 'straight',
      },
    }),
  );
  expect(result.current.data.exercises[0].revision).toBe(2);
  act(() =>
    result.current.recordActivity({
      id: 'short-set',
      exerciseId: 'own',
      setId: 'set',
      completed: true,
      createdAt: new Date().toISOString(),
      seconds: 0.99,
      kind: 'along',
    }),
  );
  expect(result.current.data.activities).toHaveLength(1);
  act(() => result.current.removeExercise('own'));
  expect(result.current.data.earnedBadges.creator).toBeTruthy();
});
