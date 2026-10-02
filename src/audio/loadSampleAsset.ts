import type { LoadedSample, SampleAsset } from './soundfont/sampleTypes';

const samples = new Map<string, Promise<LoadedSample>>();
async function load(url: string, asset: SampleAsset): Promise<LoadedSample> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open('practice-room-note-samples-v2');
    const saved = await cache.match(url);
    if (saved)
      return {
        ...asset,
        bytes: new Uint8Array(await saved.arrayBuffer()),
        compressed: saved.headers.get('x-sample-compressed') === 'true',
        sampleRate: Number(saved.headers.get('x-sample-rate')),
        frames: Number(saved.headers.get('x-sample-frames')),
      };
  } catch {
    /* Storage is optional. */
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Instrument sample could not load (${response.status}).`);
  let sample: LoadedSample = { ...asset, bytes: new Uint8Array(await response.arrayBuffer()) };
  if (asset.compressed) {
    try {
      const context = new OfflineAudioContext(1, 1, asset.sampleRate);
      const decoded = await context.decodeAudioData(new Uint8Array(sample.bytes).buffer);
      if (decoded.numberOfChannels !== 1) throw new Error('Expected mono sample');
      const pcm = decoded.getChannelData(0);
      const bytes = new Uint8Array(pcm.length * 2);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < pcm.length; i++)
        view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), true);
      sample = {
        ...sample,
        bytes,
        compressed: false,
        sampleRate: decoded.sampleRate,
        frames: pcm.length,
      };
    } catch {
      /* The synth's portable decoder handles only the selected Vorbis samples. */
    }
  }
  if (cache) {
    const target = cache;
    void target
      .put(
        url,
        new Response(new Uint8Array(sample.bytes), {
          headers: {
            'x-sample-compressed': String(sample.compressed),
            'x-sample-rate': String(sample.sampleRate),
            'x-sample-frames': String(sample.frames),
          },
        }),
      )
      .then(async () => {
        const keys = await target.keys();
        await Promise.all(
          keys.slice(0, Math.max(0, keys.length - 512)).map((key) => target.delete(key)),
        );
      })
      .catch(() => {});
  }
  return sample;
}
export function loadSampleAsset(url: string, asset: SampleAsset) {
  let pending = samples.get(url);
  if (!pending) {
    pending = load(url, asset);
    samples.set(url, pending);
    void pending.catch(() => samples.delete(url));
  }
  return pending;
}
