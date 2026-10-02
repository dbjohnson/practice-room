import { readChunks, join, writeChunk } from './decodeSoundFont';
import type { LoadedSample } from './sampleTypes';

export function assembleSamples(template: Uint8Array, samples: Map<number, LoadedSample>) {
  const text = new TextDecoder(),
    encode = new TextEncoder();
  const chunks = readChunks(template.subarray(12));
  const list = (type: string) =>
    chunks.find((c) => c.id === 'LIST' && text.decode(c.data.subarray(0, 4)) === type)!;
  const pdta = readChunks(list('pdta').data.subarray(4));
  const sdta = readChunks(list('sdta').data.subarray(4));
  const shdr = pdta.find((c) => c.id === 'shdr')!;
  shdr.data = new Uint8Array(shdr.data);
  const headers = new DataView(shdr.data.buffer);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  // Ordinary PCM precedes Vorbis, preserving the portable decoder's mixed-bank layout.
  for (const [id, sample] of [...samples].sort(
    (a, b) => Number(a[1].compressed) - Number(b[1].compressed),
  )) {
    const at = id * 46;
    const start = sample.compressed ? bytes : bytes / 2;
    headers.setUint32(at + 20, start, true);
    headers.setUint32(
      at + 24,
      start + (sample.compressed ? sample.bytes.length : sample.frames),
      true,
    );
    headers.setUint32(at + 28, sample.loopStart ? start + sample.loopStart : 0, true);
    headers.setUint32(at + 32, sample.loopEnd ? start + sample.loopEnd : 0, true);
    headers.setUint32(at + 36, sample.sampleRate, true);
    headers.setUint16(
      at + 44,
      headers.getUint16(at + 44, true) | (sample.compressed ? 16 : 0),
      true,
    );
    const padding = new Uint8Array(sample.compressed ? sample.bytes.length % 2 : 92);
    parts.push(sample.bytes, padding);
    bytes += sample.bytes.length + padding.length;
  }
  sdta.find((c) => c.id === 'smpl')!.data = join(parts);
  list('pdta').data = join([encode.encode('pdta'), ...pdta.map(writeChunk)]);
  list('sdta').data = join([encode.encode('sdta'), ...sdta.map(writeChunk)]);
  return writeChunk({ id: 'RIFF', data: join([encode.encode('sfbk'), ...chunks.map(writeChunk)]) });
}
