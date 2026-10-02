import { readChunks, readRiff, requireChunk, writeChunks, writeChunk } from './riff.ts';
import type { SampleManifest, SampleRegion } from './sampleTypes.ts';

/** Separate sample bytes from the small preset tables; clients select exact MIDI regions. */
export function splitSamples(bank: Buffer) {
  const chunks = readRiff(Buffer.from(bank), 'sfbk');
  const list = (type: string) =>
    chunks.find((c) => c.id === 'LIST' && c.data.toString('ascii', 0, 4) === type)!;
  const sdta = readChunks(list('sdta').data.subarray(4));
  const pdta = readChunks(list('pdta').data.subarray(4));
  const table = (id: string) => requireChunk(pdta, id).data;
  const smpl = requireChunk(sdta, 'smpl').data;
  const shdr = table('shdr');
  const files: Buffer[] = [];
  const samples: SampleManifest['samples'] = [];
  for (let i = 0; i < shdr.length / 46 - 1; i++) {
    const at = i * 46;
    const compressed = !!(shdr.readUInt16LE(at + 44) & 16);
    const start = shdr.readUInt32LE(at + 20),
      end = shdr.readUInt32LE(at + 24);
    const bytes = compressed ? smpl.subarray(start, end) : smpl.subarray(start * 2, end * 2);
    files.push(Buffer.from(bytes));
    samples.push({
      file: `samples/${i}.${compressed ? 'ogg' : 'pcm'}`,
      compressed,
      sampleRate: shdr.readUInt32LE(at + 36),
      frames: compressed ? 0 : end - start,
      loopStart: Math.max(0, shdr.readUInt32LE(at + 28) - (compressed ? 0 : start)),
      loopEnd: Math.max(0, shdr.readUInt32LE(at + 32) - (compressed ? 0 : start)),
    });
    for (const field of [20, 24, 28, 32]) shdr.writeUInt32LE(0, at + field);
    shdr.writeUInt16LE(shdr.readUInt16LE(at + 44) & ~16, at + 44);
  }
  const zones = (bags: Buffer, gens: Buffer, first: number, last: number) => {
    const results: Map<number, number>[] = [];
    let global = new Map<number, number>();
    for (let b = first; b < last; b++) {
      const zone = new Map<number, number>();
      for (let g = bags.readUInt16LE(b * 4); g < bags.readUInt16LE((b + 1) * 4); g++)
        zone.set(gens.readUInt16LE(g * 4), gens.readUInt16LE(g * 4 + 2));
      if (!zone.has(41) && !zone.has(53)) global = zone;
      else results.push(new Map([...global, ...zone]));
    }
    return results;
  };
  const range = (zone: Map<number, number>, op: number) => {
    const value = zone.get(op) ?? 0x7f00;
    return [value & 255, value >> 8];
  };
  const phdr = table('phdr'),
    inst = table('inst');
  const regions: SampleRegion[] = [];
  for (let p = 0; p < phdr.length / 38 - 1; p++) {
    for (const preset of zones(
      table('pbag'),
      table('pgen'),
      phdr.readUInt16LE(p * 38 + 24),
      phdr.readUInt16LE((p + 1) * 38 + 24),
    )) {
      const instrument = preset.get(41)!;
      for (const zone of zones(
        table('ibag'),
        table('igen'),
        inst.readUInt16LE(instrument * 22 + 20),
        inst.readUInt16LE((instrument + 1) * 22 + 20),
      )) {
        const keys = range(zone, 43),
          presetKeys = range(preset, 43);
        const velocity = range(zone, 44),
          presetVelocity = range(preset, 44);
        regions.push({
          bank: phdr.readUInt16LE(p * 38 + 22),
          program: phdr.readUInt16LE(p * 38 + 20),
          low: Math.max(keys[0], presetKeys[0]),
          high: Math.min(keys[1], presetKeys[1]),
          velocityLow: Math.max(velocity[0], presetVelocity[0]),
          velocityHigh: Math.min(velocity[1], presetVelocity[1]),
          sample: zone.get(53)!,
        });
      }
    }
  }
  requireChunk(sdta, 'smpl').data = Buffer.alloc(0);
  list('sdta').data = Buffer.concat([Buffer.from('sdta'), writeChunks(sdta)]);
  list('pdta').data = Buffer.concat([Buffer.from('pdta'), writeChunks(pdta)]);
  return {
    manifest: { template: 'sample-template.sf2', samples, regions } satisfies SampleManifest,
    template: writeChunk('RIFF', Buffer.concat([Buffer.from('sfbk'), writeChunks(chunks)])),
    files,
  };
}
