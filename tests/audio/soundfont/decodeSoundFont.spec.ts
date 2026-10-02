import { describe, expect, it } from 'vitest';
import { decodeSoundFont } from '../../../src/audio/soundfont/decodeSoundFont';
import { readChunks, readRiff, writeChunk, writeChunks } from '../../../src/audio/soundfont/riff';

function fixture() {
  const headers = Buffer.alloc(46 * 3);
  headers.writeUInt32LE(2, 24); // Existing two-frame PCM sample.
  headers.writeUInt16LE(1, 44);
  headers.writeUInt32LE(4, 46 + 20); // Compressed byte range.
  headers.writeUInt32LE(8, 46 + 24);
  headers.writeUInt32LE(44100, 46 + 36);
  headers.writeUInt8(60, 46 + 40);
  headers.writeUInt16LE(17, 46 + 44);
  return writeChunk(
    'RIFF',
    Buffer.concat([
      Buffer.from('sfbk'),
      writeChunks([
        {
          id: 'LIST',
          data: Buffer.concat([
            Buffer.from('sdta'),
            writeChunk('smpl', Buffer.from([1, 2, 3, 4, 79, 103, 103, 83])),
          ]),
        },
        { id: 'LIST', data: Buffer.concat([Buffer.from('pdta'), writeChunk('shdr', headers)]) },
      ]),
    ]),
  );
}
function table(bank: Uint8Array, type: string, id: string) {
  const list = readRiff(Buffer.from(bank), 'sfbk').find(
    (c) => c.id === 'LIST' && c.data.toString('ascii', 0, 4) === type,
  )!;
  return readChunks(list.data.subarray(4)).find((c) => c.id === id)!.data;
}

describe('native SoundFont decoding', () => {
  it('preserves existing PCM and converts compressed byte offsets to padded PCM sample offsets', async () => {
    const bank = fixture();
    const original = Buffer.from(bank);
    const decoded = await decodeSoundFont(
      bank,
      async (bytes) => {
        expect(Buffer.from(bytes).toString()).toBe('OggS');
        return { samples: new Float32Array([-1, 0, 0.5, 1]), sampleRate: 44100 };
      },
      new AbortController().signal,
    );
    expect(bank.equals(original)).toBe(true);
    const pcm = table(decoded, 'sdta', 'smpl');
    expect(pcm.subarray(0, 4)).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(pcm.readInt16LE(4)).toBe(-32767);
    expect(pcm.readInt16LE(8)).toBe(16384);
    expect(pcm.length).toBe(4 + 8 + 92);
    const headers = table(decoded, 'pdta', 'shdr');
    expect(headers.subarray(0, 46)).toEqual(table(original, 'pdta', 'shdr').subarray(0, 46));
    expect(headers.readUInt32LE(46 + 20)).toBe(2);
    expect(headers.readUInt32LE(46 + 24)).toBe(6);
    expect(headers.readUInt16LE(46 + 44)).toBe(1);
    expect(headers[46 + 40]).toBe(60);
    expect(
      await decodeSoundFont(
        decoded,
        async () => {
          throw new Error('Unexpected decode');
        },
        new AbortController().signal,
      ),
    ).toBe(decoded);
  });

  it('stops pending work on cancellation and propagates unsupported decoding', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      decodeSoundFont(
        fixture(),
        async () => {
          throw new Error('Should not run');
        },
        controller.signal,
      ),
    ).rejects.toThrow();
    await expect(
      decodeSoundFont(
        fixture(),
        async () => {
          throw new Error('Unsupported');
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('Unsupported');
  });

  it('rejects truncated banks and invalid sample ranges before decoding', async () => {
    const decode = async () => ({ samples: new Float32Array([0]), sampleRate: 44100 });
    await expect(
      decodeSoundFont(fixture().subarray(0, 60), decode, new AbortController().signal),
    ).rejects.toThrow('Truncated');
    const bank = fixture();
    const headers = table(bank, 'pdta', 'shdr');
    // table() returns a copy, so rebuild the invalid chunk explicitly.
    headers.writeUInt32LE(9000, 46 + 24);
    const invalid = Buffer.from(bank);
    headers.copy(invalid, invalid.indexOf(Buffer.from('shdr')) + 8);
    await expect(decodeSoundFont(invalid, decode, new AbortController().signal)).rejects.toThrow(
      'Invalid compressed',
    );
  });
});
