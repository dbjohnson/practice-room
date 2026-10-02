import type { Settings } from '@coderline/alphatab';
import type { ExerciseLoopOptions } from './exerciseLoopBuffer';
import type { LoadedSample, SampleManifest } from './soundfont/sampleTypes';
import { requiredSamples } from './requiredSamples';
import { assembleSamples } from './soundfont/assembleSamples';
import { loadSampleAsset } from './loadSampleAsset';

const catalogs = new Map<string, Promise<{ manifest: SampleManifest; template: Uint8Array }>>();
async function catalog(base: string, version: string) {
  const key = `${base}?v=${version}`;
  let pending = catalogs.get(key);
  if (!pending) {
    pending = Promise.all([
      fetch(`${base}sample-manifest.json?v=${version}`),
      fetch(`${base}sample-template.sf2?v=${version}`),
    ]).then(async ([manifest, template]) => {
      if (!manifest.ok || !template.ok) throw new Error('Instrument sample index could not load.');
      return {
        manifest: (await manifest.json()) as SampleManifest,
        template: new Uint8Array(await template.arrayBuffer()),
      };
    });
    catalogs.set(key, pending);
    void pending.catch(() => catalogs.delete(key));
  }
  return pending;
}

export async function loadScoreSamples(
  base: string,
  version: string,
  options: ExerciseLoopOptions,
  settings: Settings,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const { manifest, template } = await catalog(base, version);
  signal.throwIfAborted();
  const ids = requiredSamples(manifest, options, settings);
  const loaded = new Map<number, LoadedSample>();
  let next = 0;
  // Bound codec/network work; never fetch or decode an unused region.
  await Promise.all(
    Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (next < ids.length) {
        signal.throwIfAborted();
        const id = ids[next++],
          asset = manifest.samples[id];
        const sample = await loadSampleAsset(`${base}${asset.file}?v=${version}`, asset);
        signal.throwIfAborted();
        loaded.set(id, sample);
      }
    }),
  );
  return assembleSamples(template, loaded);
}
