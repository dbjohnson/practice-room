import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRecordedBank } from '../../src/audio/loadRecordedBank';
import { decodeSoundFont } from '../../src/audio/soundfont/decodeSoundFont';

vi.mock('../../src/audio/soundfont/decodeSoundFont', () => ({ decodeSoundFont: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function setup() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
  );
  const decodeAudioData = vi.fn(async () => ({
    numberOfChannels: 1,
    sampleRate: 44100,
    getChannelData: () => new Float32Array([0, 0.25]),
  }));
  vi.stubGlobal(
    'OfflineAudioContext',
    class {
      decodeAudioData = decodeAudioData;
    },
  );
  return decodeAudioData;
}
const signal = () => new AbortController().signal;

describe('recorded bank cache', () => {
  it('decodes once for concurrent callers and gives players independent buffers', async () => {
    const native = setup();
    vi.mocked(decodeSoundFont).mockImplementation(async (bank, decode) => {
      expect([...bank]).toEqual([1, 2, 3]);
      expect((await decode(new ArrayBuffer(4))).sampleRate).toBe(44100);
      return new Uint8Array([4, 5]);
    });
    const [a, b] = await Promise.all([
      loadRecordedBank('/shared.sf3', signal()),
      loadRecordedBank('/shared.sf3', signal()),
    ]);
    a[0] = 99;
    expect([...b]).toEqual([4, 5]);
    expect([...(await loadRecordedBank('/shared.sf3', signal()))]).toEqual([4, 5]);
    expect(native).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('cancels one consumer without discarding a shared load needed by another mount', async () => {
    setup();
    let done!: (bank: Uint8Array) => void;
    vi.mocked(decodeSoundFont).mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const cancelled = new AbortController();
    const first = loadRecordedBank('/cancel.sf3', cancelled.signal);
    const second = loadRecordedBank('/cancel.sf3', signal());
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    cancelled.abort();
    await vi.waitFor(() => expect(done).toBeDefined());
    done(new Uint8Array([7]));
    await rejected;
    expect([...(await second)]).toEqual([7]);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('uses a persistent decoded bank without fetching or decoding', async () => {
    setup();
    const match = vi.fn(async () => new Response(new Uint8Array([8, 9])));
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match })) });
    expect([...(await loadRecordedBank('/persisted.sf3?v=abc', signal()))]).toEqual([8, 9]);
    expect(match).toHaveBeenCalledWith('/persisted.sf3?v=abc');
    expect(fetch).not.toHaveBeenCalled();
    expect(decodeSoundFont).not.toHaveBeenCalled();
  });
  it('keeps playing when cache storage and native decoding are unavailable', async () => {
    setup();
    vi.stubGlobal('caches', {
      open: vi.fn(async () => {
        throw new Error('Storage denied');
      }),
    });
    vi.mocked(decodeSoundFont).mockRejectedValue(new Error('Unsupported codec'));
    expect([...(await loadRecordedBank('/fallback.sf3', signal()))]).toEqual([1, 2, 3]);
  });
  it('retries failed downloads and treats new sample versions as new banks', async () => {
    setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(loadRecordedBank('/retry.sf3?v=1', signal())).rejects.toThrow('503');
    vi.mocked(decodeSoundFont).mockResolvedValue(new Uint8Array([6]));
    await loadRecordedBank('/retry.sf3?v=1', signal());
    await loadRecordedBank('/retry.sf3?v=2', signal());
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(decodeSoundFont).toHaveBeenCalledTimes(2);
  });
});
