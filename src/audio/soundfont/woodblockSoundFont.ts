import { readChunks, readRiff, requireChunk, writeChunk, writeChunks } from './riff.ts';

// alphaTab uses percussion bank 128, preset 0, key 33 for both click and count-in.
const metronomeKey = 33;

function generator(operator: number, amount: number): Buffer {
  const result = Buffer.alloc(4);
  result.writeUInt16LE(operator, 0);
  result.writeUInt16LE(amount & 0xffff, 2);
  return result;
}

export function woodblockSoundFont(original: Buffer, wav: Buffer): Buffer {
  const wave = readRiff(wav, 'WAVE');
  const format = requireChunk(wave, 'fmt ').data;
  if (
    format.readUInt16LE(0) !== 1 ||
    format.readUInt16LE(2) !== 1 ||
    format.readUInt16LE(14) !== 16
  )
    throw new Error('The woodblock must be mono 16-bit PCM WAV.');
  const pcm = requireChunk(wave, 'data').data;
  if (!pcm.length || pcm.length % 2) throw new Error('Invalid woodblock PCM data.');

  // Copy before editing: callers can still use the unmodified bank for comparison.
  const chunks = readRiff(Buffer.from(original), 'sfbk');
  const list = (type: string) => {
    const chunk = chunks.find(
      (chunk) => chunk.id === 'LIST' && chunk.data.toString('ascii', 0, 4) === type,
    );
    if (!chunk) throw new Error(`Missing SoundFont list: ${type}.`);
    return chunk;
  };
  const sampleList = list('sdta');
  const sampleChunks = readChunks(sampleList.data.subarray(4));
  const sampleData = requireChunk(sampleChunks, 'smpl');
  const presetList = list('pdta');
  const presetChunks = readChunks(presetList.data.subarray(4));
  const table = (id: string) => requireChunk(presetChunks, id).data;
  const phdr = table('phdr');
  const pbag = table('pbag');
  const pgen = table('pgen');
  const inst = table('inst');
  const ibag = table('ibag');
  const igen = table('igen');
  const shdr = table('shdr');

  // Locate the exact metronome zone, avoiding samples shared with other instruments.
  const zones: number[] = [];
  for (let preset = 0; preset < phdr.length / 38 - 1; preset++) {
    if (phdr.readUInt16LE(preset * 38 + 20) !== 0 || phdr.readUInt16LE(preset * 38 + 22) !== 128)
      continue;
    const firstBag = phdr.readUInt16LE(preset * 38 + 24);
    const lastBag = phdr.readUInt16LE((preset + 1) * 38 + 24);
    for (let bag = firstBag; bag < lastBag; bag++) {
      for (let gen = pbag.readUInt16LE(bag * 4); gen < pbag.readUInt16LE((bag + 1) * 4); gen++) {
        if (pgen.readUInt16LE(gen * 4) !== 41) continue;
        const instrument = pgen.readUInt16LE(gen * 4 + 2);
        const firstZone = inst.readUInt16LE(instrument * 22 + 20);
        const lastZone = inst.readUInt16LE((instrument + 1) * 22 + 20);
        for (let zone = firstZone; zone < lastZone; zone++) {
          for (let g = ibag.readUInt16LE(zone * 4); g < ibag.readUInt16LE((zone + 1) * 4); g++) {
            if (igen.readUInt16LE(g * 4) === 43 && igen.readUInt16LE(g * 4 + 2) === 0x2121)
              zones.push(zone);
          }
        }
      }
    }
  }
  if (zones.length !== 1) throw new Error('Expected one dedicated metronome zone in SONiVOX.');

  const start = sampleData.data.length / 2;
  const end = start + pcm.length / 2;
  const sampleIndex = shdr.length / 46 - 1;
  const header = Buffer.alloc(46);
  header.write('Kount Woody Block', 0, 20, 'ascii');
  header.writeUInt32LE(start, 20);
  header.writeUInt32LE(end, 24);
  header.writeUInt32LE(start, 28);
  header.writeUInt32LE(end, 32);
  header.writeUInt32LE(format.readUInt32LE(4), 36);
  header.writeUInt8(metronomeKey, 40);
  header.writeUInt16LE(1, 44); // Mono, uncompressed, unlinked sample.
  requireChunk(presetChunks, 'shdr').data = Buffer.concat([
    shdr.subarray(0, -46),
    header,
    shdr.subarray(-46),
  ]);
  sampleData.data = Buffer.concat([sampleData.data, pcm, Buffer.alloc(46 * 2)]);

  const zone = zones[0];
  const firstGen = ibag.readUInt16LE(zone * 4);
  const lastGen = ibag.readUInt16LE((zone + 1) * 4);
  const replacement = Buffer.concat([
    generator(43, metronomeKey | (metronomeKey << 8)),
    generator(34, -12000), // Immediate attack, preserving the recorded transient.
    generator(38, -3986), // 100 ms release if playback interrupts the hit.
    generator(54, 0), // One shot; never loop this sample.
    generator(58, metronomeKey), // Play at the original pitch.
    generator(53, sampleIndex),
  ]);
  requireChunk(presetChunks, 'igen').data = Buffer.concat([
    igen.subarray(0, firstGen * 4),
    replacement,
    igen.subarray(lastGen * 4),
  ]);
  const delta = replacement.length / 4 - (lastGen - firstGen);
  for (let bag = zone + 1; bag < ibag.length / 4; bag++)
    ibag.writeUInt16LE(ibag.readUInt16LE(bag * 4) + delta, bag * 4);

  sampleList.data = Buffer.concat([Buffer.from('sdta'), writeChunks(sampleChunks)]);
  presetList.data = Buffer.concat([Buffer.from('pdta'), writeChunks(presetChunks)]);
  return writeChunk('RIFF', Buffer.concat([Buffer.from('sfbk'), writeChunks(chunks)]));
}
