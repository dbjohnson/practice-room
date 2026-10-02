export interface Chunk {
  id: string;
  data: Uint8Array;
}
interface DecodedSample {
  samples: Float32Array;
  sampleRate: number;
}
const text = new TextDecoder();
const encoder = new TextEncoder();

export function readChunks(data: Uint8Array): Chunk[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunks: Chunk[] = [];
  for (let offset = 0; offset < data.length;) {
    if (offset + 8 > data.length) throw new Error('Truncated SoundFont header');
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > data.length) throw new Error('Truncated SoundFont data');
    chunks.push({
      id: text.decode(data.subarray(offset, offset + 4)),
      data: data.subarray(offset + 8, offset + 8 + size),
    });
    offset += 8 + size + (size % 2);
  }
  return chunks;
}
export function join(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
export function writeChunk({ id, data }: Chunk): Uint8Array {
  const bytes = new Uint8Array(8 + data.length + (data.length % 2));
  bytes.set(encoder.encode(id));
  new DataView(bytes.buffer).setUint32(4, data.length, true);
  bytes.set(data, 8);
  return bytes;
}

/** Decode Vorbis once with the native browser codec; hand alphaTab ordinary PCM. */
export async function decodeSoundFont(
  bank: Uint8Array,
  decode: (ogg: ArrayBuffer) => Promise<DecodedSample>,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (text.decode(bank.subarray(0, 4)) !== 'RIFF' || text.decode(bank.subarray(8, 12)) !== 'sfbk')
    throw new Error('Invalid SoundFont');
  const chunks = readChunks(bank.subarray(12));
  const getList = (type: string) => {
    const list = chunks.find((c) => c.id === 'LIST' && text.decode(c.data.subarray(0, 4)) === type);
    if (!list) throw new Error(`Missing SoundFont list: ${type}`);
    return { list, children: readChunks(list.data.subarray(4)) };
  };
  const { list: sampleList, children: sampleChunks } = getList('sdta');
  const { list: presetList, children: presetChunks } = getList('pdta');
  const sampleChunk = sampleChunks.find((c) => c.id === 'smpl');
  const headerChunk = presetChunks.find((c) => c.id === 'shdr');
  if (!sampleChunk || !headerChunk) throw new Error('Missing SoundFont samples');
  const headers = new Uint8Array(headerChunk.data);
  const view = new DataView(headers.buffer);
  const compressed: { offset: number; start: number; end: number }[] = [];
  for (let offset = 0; offset < headers.length - 46; offset += 46) {
    if (view.getUint16(offset + 44, true) & 16) {
      const start = view.getUint32(offset + 20, true),
        end = view.getUint32(offset + 24, true);
      if (start >= end || end > sampleChunk.data.length)
        throw new Error('Invalid compressed sample range');
      compressed.push({ offset, start, end });
    }
  }
  if (!compressed.length) return bank;
  // The generated bank appends all Vorbis data after the inherited PCM section.
  let originalBytes = Math.min(...compressed.map((s) => s.start));
  for (let offset = 0; offset < headers.length - 46; offset += 46)
    if (
      !(view.getUint16(offset + 44, true) & 16) &&
      view.getUint32(offset + 24, true) * 2 > originalBytes
    )
      originalBytes = sampleChunk.data.length;
  const pcm: Uint8Array[] = new Array(compressed.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < compressed.length) {
        signal.throwIfAborted();
        const index = next++;
        const { start, end, offset } = compressed[index];
        const decoded = await decode(new Uint8Array(sampleChunk.data.subarray(start, end)).buffer);
        signal.throwIfAborted();
        const bytes = new Uint8Array(decoded.samples.length * 2 + 92);
        const output = new DataView(bytes.buffer);
        for (let i = 0; i < decoded.samples.length; i++) {
          const value = decoded.samples[i];
          if (!Number.isFinite(value)) throw new Error('Invalid decoded sample');
          output.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true);
        }
        pcm[index] = bytes;
        view.setUint32(offset + 36, decoded.sampleRate, true);
      }
    }),
  );
  let position = originalBytes / 2;
  for (const [index, { offset }] of compressed.entries()) {
    const length = pcm[index].length / 2 - 46;
    for (const field of [28, 32]) {
      const loop = view.getUint32(offset + field, true);
      if (loop) view.setUint32(offset + field, position + loop, true);
    }
    view.setUint32(offset + 20, position, true);
    view.setUint32(offset + 24, position + length, true);
    view.setUint16(offset + 44, view.getUint16(offset + 44, true) & ~16, true);
    position += length + 46;
  }
  sampleChunk.data = join([sampleChunk.data.subarray(0, originalBytes), ...pcm]);
  headerChunk.data = headers;
  sampleList.data = join([encoder.encode('sdta'), ...sampleChunks.map(writeChunk)]);
  presetList.data = join([encoder.encode('pdta'), ...presetChunks.map(writeChunk)]);
  return writeChunk({
    id: 'RIFF',
    data: join([encoder.encode('sfbk'), ...chunks.map(writeChunk)]),
  });
}
