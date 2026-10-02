import { afterEach, expect, it, vi } from 'vitest';
import { Settings } from '@coderline/alphatab';
import { loadScoreSamples } from '../../src/audio/loadScoreSamples';
import { loadSampleAsset } from '../../src/audio/loadSampleAsset';
import { requiredSamples } from '../../src/audio/requiredSamples';
import { assembleSamples } from '../../src/audio/soundfont/assembleSamples';
import type { ExerciseLoopOptions } from '../../src/audio/exerciseLoopBuffer';

vi.mock('../../src/audio/loadSampleAsset', () => ({ loadSampleAsset: vi.fn() }));
vi.mock('../../src/audio/requiredSamples', () => ({ requiredSamples: vi.fn() }));
vi.mock('../../src/audio/soundfont/assembleSamples', () => ({ assembleSamples: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const manifest = {
  samples: Array.from({ length: 12 }, (_, id) => ({ file: `samples/${id}.ogg` })),
  regions: [],
};
const fetcher = () =>
  vi.fn(async (url: string) =>
    url.includes('manifest')
      ? new Response(JSON.stringify(manifest))
      : new Response(new Uint8Array([1])),
  );
const options = {} as ExerciseLoopOptions;

it('requests only required notes, reuses the catalog, and never fetches the complete bank', async () => {
  const fetch = fetcher();
  vi.stubGlobal('fetch', fetch);
  vi.mocked(requiredSamples).mockReturnValue([2, 7]);
  vi.mocked(loadSampleAsset).mockResolvedValue({ bytes: new Uint8Array([3]) } as never);
  await loadScoreSamples(
    '/soundfont/',
    'exact',
    options,
    new Settings(),
    new AbortController().signal,
  );
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/soundfont/sample-manifest.json?v=exact',
    '/soundfont/sample-template.sf2?v=exact',
  ]);
  expect(vi.mocked(loadSampleAsset).mock.calls.map(([url]) => url)).toEqual([
    '/soundfont/samples/2.ogg?v=exact',
    '/soundfont/samples/7.ogg?v=exact',
  ]);
  expect(vi.mocked(assembleSamples).mock.calls[0][1].size).toBe(2);
  vi.mocked(requiredSamples).mockReturnValue([8]);
  await loadScoreSamples(
    '/soundfont/',
    'exact',
    options,
    new Settings(),
    new AbortController().signal,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(loadSampleAsset).toHaveBeenLastCalledWith(
    '/soundfont/samples/8.ogg?v=exact',
    manifest.samples[8],
  );
});

it('limits parallel loading and stops queued notes when a stale score is cancelled', async () => {
  vi.stubGlobal('fetch', fetcher());
  vi.mocked(requiredSamples).mockReturnValue(Array.from({ length: 12 }, (_, id) => id));
  const complete: (() => void)[] = [];
  vi.mocked(loadSampleAsset).mockImplementation(
    () =>
      new Promise((resolve) =>
        complete.push(() => resolve({ bytes: new Uint8Array([1]) } as never)),
      ),
  );
  const abort = new AbortController();
  const pending = loadScoreSamples('/soundfont/', 'cancel', options, new Settings(), abort.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(complete).toHaveLength(4));
  abort.abort();
  complete.forEach((resolve) => resolve());
  await rejected;
  expect(loadSampleAsset).toHaveBeenCalledTimes(4);
  expect(assembleSamples).not.toHaveBeenCalled();
});
