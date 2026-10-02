import { readChunks, readRiff, requireChunk, writeChunk, writeChunks } from './riff.ts';
import { generator, namedRecord, type BandRegion } from './bandTypes.ts';

// Calibrated against rendered band phrases, rather than individual sample peaks.
// Leave drum transients intact; bring sustained instruments down around the kit.
const instrumentAttenuationDb = new Map([
  [27, 6.5],
  [33, 5],
  [0, 5],
]);

/** Add recorded instruments to the existing bank, retaining uncovered GM notes. */
export function bandSoundFont(
  original: Buffer,
  regions: BandRegion[],
  readSample: (file: string) => Buffer,
): Buffer {
  const chunks = readRiff(Buffer.from(original), 'sfbk');
  const list = (type: string) => {
    const chunk = chunks.find((c) => c.id === 'LIST' && c.data.toString('ascii', 0, 4) === type);
    if (!chunk) throw new Error(`Missing SoundFont list: ${type}`);
    return chunk;
  };
  const pdta = readChunks(list('pdta').data.subarray(4));
  const sdta = readChunks(list('sdta').data.subarray(4));
  const table = (id: string) => requireChunk(pdta, id).data;
  const phdr = table('phdr');
  const pbag = table('pbag');
  const pgen = table('pgen');
  const oldInst = table('inst');
  const oldBag = table('ibag');
  const oldGen = table('igen');
  const sampleChunks = [requireChunk(sdta, 'smpl').data];
  const headers = [table('shdr').subarray(0, -46)];
  const instruments = [oldInst.subarray(0, -22)];
  const bags = [oldBag.subarray(0, -4)];
  const gens = [oldGen.subarray(0, -4)];
  let sampleBytes = sampleChunks[0].length;
  let sampleCount = headers[0].length / 46;
  let instrumentCount = instruments[0].length / 22;
  let bagCount = bags[0].length / 4;
  let genCount = gens[0].length / 4;
  const samples = new Map<string, number>();
  const addZone = (zone: Buffer) => {
    bags.push(generator(genCount, 0));
    gens.push(zone);
    bagCount++;
    genCount += zone.length / 4;
  };
  const sampleId = (region: BandRegion) => {
    const cached = samples.get(region.file);
    if (cached !== undefined) return cached;
    const data = readSample(region.file);
    if (data.toString('ascii', 0, 4) !== 'OggS') throw new Error(`Invalid Ogg: ${region.file}`);
    const id = sampleCount++;
    const header = namedRecord(region.file.replace('band/', ''), 46);
    // SF3 compressed headers address bytes; inherited PCM headers address samples.
    header.writeUInt32LE(sampleBytes, 20);
    header.writeUInt32LE(sampleBytes + data.length, 24);
    header.writeUInt32LE(region.sampleRate, 36);
    header.writeUInt8(region.root, 40);
    header.writeUInt16LE(17, 44); // Mono Vorbis.
    headers.push(header);
    sampleChunks.push(data, Buffer.alloc(data.length % 2));
    sampleBytes += data.length + (data.length % 2);
    samples.set(region.file, id);
    return id;
  };

  const patches = new Map<string, BandRegion[]>();
  for (const region of regions) {
    const key = `${region.bank}:${region.program}`;
    const patch = patches.get(key) ?? [];
    patch.push(region);
    patches.set(key, patch);
  }
  for (let p = 0; p < phdr.length / 38 - 1; p++) {
    const patchKey = `${phdr.readUInt16LE(p * 38 + 22)}:${phdr.readUInt16LE(p * 38 + 20)}`;
    const patch = patches.get(patchKey);
    if (!patch) continue;
    const links: number[] = [];
    for (let b = phdr.readUInt16LE(p * 38 + 24); b < phdr.readUInt16LE((p + 1) * 38 + 24); b++)
      for (let g = pbag.readUInt16LE(b * 4); g < pbag.readUInt16LE((b + 1) * 4); g++)
        if (pgen.readUInt16LE(g * 4) === 41) links.push(g);
    if (links.length !== 1) throw new Error(`Expected one instrument for ${patchKey}`);
    const originalInstrument = pgen.readUInt16LE(links[0] * 4 + 2);
    const instrument = namedRecord(`Practice ${patchKey}`, 22);
    instrument.writeUInt16LE(bagCount, 20);
    instruments.push(instrument);
    pgen.writeUInt16LE(instrumentCount++, links[0] * 4 + 2);

    // Keep fallback zones only on keys not covered by the new recordings.
    const covered = new Set(
      patch.flatMap((r) => Array.from({ length: r.high - r.low + 1 }, (_, i) => r.low + i)),
    );
    const first = oldInst.readUInt16LE(originalInstrument * 22 + 20);
    const last = oldInst.readUInt16LE((originalInstrument + 1) * 22 + 20);
    let globalZone: Buffer = Buffer.alloc(0);
    for (let b = first; b < last; b++) {
      let zone = oldGen.subarray(
        oldBag.readUInt16LE(b * 4) * 4,
        oldBag.readUInt16LE((b + 1) * 4) * 4,
      );
      const operators = new Set<number>();
      for (let g = 0; g < zone.length; g += 4) operators.add(zone.readUInt16LE(g));
      if (!operators.has(53)) {
        globalZone = zone;
        continue;
      }
      const inherited: Buffer[] = [];
      for (let g = 0; g < globalZone.length; g += 4)
        if (!operators.has(globalZone.readUInt16LE(g)))
          inherited.push(globalZone.subarray(g, g + 4));
      zone = Buffer.concat([...inherited, zone]);
      let rangeOffset = -1;
      for (let g = 0; g < zone.length; g += 4) if (zone.readUInt16LE(g) === 43) rangeOffset = g;
      if (rangeOffset < 0) {
        zone = Buffer.concat([generator(43, 0x7f00), zone]);
        rangeOffset = 0;
      }
      const low = zone[rangeOffset + 2];
      const high = zone[rangeOffset + 3];
      let start = -1;
      for (let key = low; key <= high + 1; key++) {
        if (key <= high && !covered.has(key)) {
          if (start < 0) start = key;
        } else if (start >= 0) {
          const fallback = Buffer.from(zone);
          fallback[rangeOffset + 2] = start;
          fallback[rangeOffset + 3] = key - 1;
          addZone(fallback);
          start = -1;
        }
      }
    }
    for (const r of patch) {
      addZone(
        Buffer.concat([
          generator(43, r.low | (r.high << 8)),
          generator(44, r.velocity[0] | (r.velocity[1] << 8)),
          generator(17, Math.round(r.pan * 500)),
          generator(34, -12000),
          generator(38, Math.round(1200 * Math.log2(r.release))),
          generator(48, r.bank === 128 ? 0 : (instrumentAttenuationDb.get(r.program) ?? 0) * 10),
          generator(54, 0),
          generator(57, r.group),
          generator(58, r.root),
          generator(53, sampleId(r)),
        ]),
      );
    }
    patches.delete(patchKey);
  }
  if (patches.size) throw new Error(`Missing presets: ${[...patches.keys()].join(', ')}`);
  const endInstrument = namedRecord('EOI', 22);
  endInstrument.writeUInt16LE(bagCount, 20);
  requireChunk(pdta, 'inst').data = Buffer.concat([...instruments, endInstrument]);
  requireChunk(pdta, 'ibag').data = Buffer.concat([...bags, generator(genCount, 0)]);
  requireChunk(pdta, 'igen').data = Buffer.concat([...gens, Buffer.alloc(4)]);
  requireChunk(pdta, 'shdr').data = Buffer.concat([...headers, namedRecord('EOS', 46)]);
  requireChunk(sdta, 'smpl').data = Buffer.concat(sampleChunks);
  list('pdta').data = Buffer.concat([Buffer.from('pdta'), writeChunks(pdta)]);
  list('sdta').data = Buffer.concat([Buffer.from('sdta'), writeChunks(sdta)]);
  const info = readChunks(list('INFO').data.subarray(4));
  requireChunk(info, 'ifil').data = Buffer.from([3, 0, 0, 0]);
  requireChunk(info, 'INAM').data = Buffer.from('Practice Room recorded band\0');
  requireChunk(info, 'ICMT').data = Buffer.from(
    'SONiVOX base; Kount drums; Karoryfer CC0 bass/guitar; Salamander piano by Alexander Holm, CC BY 3.0. See docs/audio-assets.md.\0',
  );
  list('INFO').data = Buffer.concat([Buffer.from('INFO'), writeChunks(info)]);
  return writeChunk('RIFF', Buffer.concat([Buffer.from('sfbk'), writeChunks(chunks)]));
}
