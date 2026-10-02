import { decodeSoundFont } from './soundfont/decodeSoundFont';

async function decodeBank(url: string): Promise<Uint8Array> {
  const signal = new AbortController().signal;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Instrument sounds could not load (${response.status}).`);
  const bank = new Uint8Array(await response.arrayBuffer());
  try {
    // Offline decoding never opens a microphone or an audio output device.
    const context = new OfflineAudioContext(1, 1, 44100);
    return await decodeSoundFont(
      bank,
      async (bytes) => {
        const audio = await context.decodeAudioData(bytes);
        if (audio.numberOfChannels !== 1) throw new Error('Expected a mono recording');
        return { samples: audio.getChannelData(0), sampleRate: audio.sampleRate };
      },
      signal,
    );
  } catch {
    signal.throwIfAborted();
    // alphaTab's portable decoder remains available when native Vorbis is unsupported.
    return bank;
  }
}

const banks = new Map<string, Promise<Uint8Array>>();
async function cachedBank(url: string): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open('practice-room-decoded-instruments-v1');
    const saved = await cache.match(url);
    if (saved) return new Uint8Array(await saved.arrayBuffer());
  } catch {
    // Private browsing or a full cache must not prevent playing music.
  }
  const bank = await decodeBank(url);
  if (cache) {
    const target = cache;
    void target
      .put(url, new Response(new Uint8Array(bank)))
      .then(async () => {
        const keys = await target.keys();
        await Promise.all(
          keys.slice(0, Math.max(0, keys.length - 2)).map((key) => target.delete(key)),
        );
      })
      .catch(() => {});
  }
  return bank;
}

/** Share download/decoding across mounts. A caller's cancellation does not cancel other players. */
export async function loadRecordedBank(url: string, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  let bank = banks.get(url);
  if (!bank) {
    bank = cachedBank(url);
    banks.set(url, bank);
    void bank.catch(() => banks.delete(url));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    bank.then(
      (data) => {
        signal.removeEventListener('abort', abort);
        if (!signal.aborted) resolve(new Uint8Array(data));
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
