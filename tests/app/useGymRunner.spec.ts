// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGymStore } from '../../src/app/useGymStore';
import { useGymRunner } from '../../src/app/useGymRunner';
import { starterRoutines } from '../../src/music/exerciseCatalog';
import { readGym } from '../../src/storage/gym';
import { emptyGym } from '../../src/domain/gym';
vi.mock('../../src/storage/gym', () => ({
  readGym: vi.fn(),
  writeGym: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup() {
  vi.mocked(readGym).mockResolvedValue(emptyGym());
  const open = vi.fn().mockResolvedValue(true),
    halt = vi.fn(),
    notify = vi.fn();
  const hook = renderHook(() => {
    const store = useGymStore(notify);
    return { store, runner: useGymRunner(store, open, halt, notify) };
  });
  return { ...hook, open, halt, notify };
}
describe('gym workout lifecycle', () => {
  it('starts, pauses, resumes, retries, explicitly skips and completes snapshots', async () => {
    const { result, open } = setup();
    await waitFor(() => expect(result.current.store.ready).toBe(true));
    await act(async () => {
      await result.current.runner.start(starterRoutines[0]);
    });
    const run = result.current.runner.run!;
    expect(run.queue).toHaveLength(8);
    expect(run.status).toBe('active');
    act(() => result.current.runner.pause());
    expect(result.current.runner.run?.status).toBe('paused');
    await act(async () => {
      await result.current.runner.resume();
    });
    expect(result.current.runner.run?.id).toBe(run.id);
    await act(async () => {
      await result.current.runner.retry();
    });
    expect(result.current.runner.run?.index).toBe(0);
    for (let i = 0; i < 8; i++)
      await act(async () => {
        await result.current.runner.advance(true);
      });
    expect(result.current.runner.run?.status).toBe('completed');
    expect(result.current.store.data.completedRuns[0]).toMatchObject({ completed: 0, skipped: 8 });
    expect(open).toHaveBeenCalledTimes(10);
  });
  it('retains a paused set when loading its score fails', async () => {
    const { result, open } = setup();
    await waitFor(() => expect(result.current.store.ready).toBe(true));
    open.mockResolvedValue(false);
    await act(async () => {
      await result.current.runner.start(starterRoutines[0]);
    });
    expect(result.current.runner.run?.status).toBe('paused');
    expect(result.current.runner.loading).toBe(false);
  });
  it('does not activate an obsolete request after the user pauses', async () => {
    const { result, open } = setup();
    await waitFor(() => expect(result.current.store.ready).toBe(true));
    let finish: (loaded: boolean) => void = () => {};
    open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let pending: Promise<void>;
    act(() => {
      pending = result.current.runner.start(starterRoutines[0]);
    });
    act(() => result.current.runner.pause());
    await act(async () => {
      finish(true);
      await pending!;
    });
    expect(result.current.runner.run).toBeNull();
  });
});
