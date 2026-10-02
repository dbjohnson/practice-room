export interface RiffChunk {
  id: string;
  data: Buffer;
}

export function readChunks(data: Buffer): RiffChunk[] {
  const chunks: RiffChunk[] = [];
  for (let offset = 0; offset < data.length;) {
    if (offset + 8 > data.length) throw new Error('Truncated RIFF chunk header.');
    const size = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > data.length) throw new Error('Truncated RIFF chunk data.');
    chunks.push({
      id: data.toString('ascii', offset, offset + 4),
      data: data.subarray(offset + 8, end),
    });
    offset = end + (size % 2);
  }
  return chunks;
}

export function readRiff(data: Buffer, form: string): RiffChunk[] {
  if (
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== form ||
    data.readUInt32LE(4) + 8 !== data.length
  )
    throw new Error(`Expected a complete ${form} RIFF file.`);
  return readChunks(data.subarray(12));
}

export function writeChunk(id: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 4, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, Buffer.alloc(data.length % 2)]);
}

export function writeChunks(chunks: RiffChunk[]): Buffer {
  return Buffer.concat(chunks.map(({ id, data }) => writeChunk(id, data)));
}

export function requireChunk(chunks: RiffChunk[], id: string): RiffChunk {
  const chunk = chunks.find((chunk) => chunk.id === id);
  if (!chunk) throw new Error(`Missing RIFF chunk: ${id}.`);
  return chunk;
}
