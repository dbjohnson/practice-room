import { afterEach, expect, it, vi } from 'vitest';
import type { SampleAsset } from '../../src/audio/soundfont/sampleTypes';

const asset: SampleAsset = {
  file: 'guitar.ogg',
  compressed: true,
  sampleRate: 48000,
  frames: 0,
  loopStart: 0,
  loopEnd: 0,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('shares concurrent note downloads and caches the decoded PCM across reloads', async () => {
  const saved = new Map<string, Response>();
  const cache = {
    match: async (url: string) => saved.get(url)?.clone(),
    put: async (url: string, response: Response) => {
      saved.set(url, response);
    },
    keys: async () => [],
  };
  vi.stubGlobal('caches', { open: async () => cache });
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetcher);
  const decode = vi.fn(async () => ({
    numberOfChannels: 1,
    sampleRate: 48000,
    getChannelData: () => new Float32Array([0.5, -0.5]),
  }));
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      decodeAudioData = decode;
    },
  );
  const { loadSampleAsset } = await import('../../src/audio/loadSampleAsset');
  const [a, b] = await Promise.all([
    loadSampleAsset('/note?v=1', asset),
    loadSampleAsset('/note?v=1', asset),
  ]);
  expect(a).toBe(b);
  expect(a).toMatchObject({ compressed: false, frames: 2, sampleRate: 48000 });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(decode).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(saved.size).toBe(1));
  vi.resetModules();
  const { loadSampleAsset: reloaded } = await import('../../src/audio/loadSampleAsset');
  expect(await reloaded('/note?v=1', asset)).toEqual(a);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(decode).toHaveBeenCalledOnce();
});

it('retains compressed samples when native decoding is unsupported, and retries failed downloads', async () => {
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      async decodeAudioData() {
        throw new Error('Unsupported codec');
      }
    },
  );
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('fetch', fetcher);
  const { loadSampleAsset } = await import('../../src/audio/loadSampleAsset');
  await expect(loadSampleAsset('/note?v=2', asset)).rejects.toThrow('503');
  expect(await loadSampleAsset('/note?v=2', asset)).toMatchObject({
    compressed: true,
    bytes: new Uint8Array([1, 2, 3]),
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
