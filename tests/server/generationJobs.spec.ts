import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { GenerationJobs } from '../../src/server/generationJobs';

const directories: string[] = [];
const input = { prompt: 'A blues riff', instrument: 'guitar', level: 'beginner' } as const;
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
it('persists acceptance and completion without a browser, and reopens the saved result after restart', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'durable-generation-'));
  directories.push(directory);
  let complete!: (value: { alphaTex: string }) => void;
  const generate = vi.fn(
    () =>
      new Promise<{ alphaTex: string }>((resolve) => {
        complete = resolve;
      }),
  );
  const jobs = new GenerationJobs(directory);
  const id = await jobs.start(input, generate);
  expect(JSON.parse(await readFile(resolve(directory, `${id}.json`), 'utf8')).input).toEqual(input);
  expect((await stat(resolve(directory, `${id}.json`))).mode & 0o777).toBe(0o600);
  // No polling/browser is needed while the model works.
  complete({ alphaTex: ':4 0.6 |' });
  const restarted = new GenerationJobs(directory);
  await vi.waitFor(async () =>
    expect((await restarted.get(id))?.result).toEqual({ alphaTex: ':4 0.6 |' }),
  );
  await restarted.start(input, generate, id);
  expect(generate).toHaveBeenCalledOnce();
});
it('coalesces simultaneous submissions with the same client receipt', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'durable-generation-'));
  directories.push(directory);
  const id = 'aa000000-0000-4000-8000-000000000001';
  const generate = vi.fn(async () => ({ alphaTex: ':4 0.6 |' }));
  const jobs = new GenerationJobs(directory);
  await Promise.all([jobs.start(input, generate, id), jobs.start(input, generate, id)]);
  await vi.waitFor(async () => expect((await jobs.get(id))?.result).toBeTruthy());
  expect(generate).toHaveBeenCalledOnce();
  expect(await jobs.get('../secret')).toBeUndefined();
});
