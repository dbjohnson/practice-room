import { afterEach, describe, expect, it, vi } from 'vitest';
import { bitmidi } from '../../../src/server/sources/bitmidi';
import { mutopia, parseMutopia } from '../../../src/server/sources/mutopia';
import { download } from '../../../src/server/sources/provider';
import { songsterr } from '../../../src/server/sources/songsterr';

const signal = new AbortController().signal;
const answer = (body: string | Uint8Array<ArrayBuffer>, init?: ResponseInit) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(body, init));
afterEach(() => vi.restoreAllMocks());

const mutopiaPage = `<h2>Music Listing</h2>
<table class="table-bordered result-table">
<tr><td>Trois Sonatines, No. 1</td><td>by M. Carcassi (1792&ndash;1853)</td><td>Op. 1 No. 1</td><td>&nbsp;</td></tr>
<tr><td>for Guitar</td><td>c.1827</td><td>Classical</td><td></td></tr>
<tr><td>Mayence</td><td><a href="../legal.html#ccasa">Creative Commons Attribution-ShareAlike 4.0</a></td>
<td><a href="piece-info.cgi?id=2165">More Information</a></td><td>2017/02/15</td></tr>
<tr><td>Download: <a href="https://www.mutopiaproject.org/ftp/CarcassiM/O1/carcassi-op1n01/carcassi-op1n01.ly">.ly file</a></td>
<td><a href="https://www.mutopiaproject.org/ftp/CarcassiM/O1/carcassi-op1n01/carcassi-op1n01.mid">.mid file</a></td></tr></table>
<table class="table-bordered result-table"><tr><td>Zipped only</td><td>by X</td><td></td><td></td></tr></table>`;

describe('Mutopia', () => {
  it('reads pieces from the result page and skips those without a MIDI file', () => {
    expect(parseMutopia(mutopiaPage)).toEqual([
      {
        source: 'mutopia',
        id: 'CarcassiM/O1/carcassi-op1n01/carcassi-op1n01.mid',
        title: 'Trois Sonatines, No. 1, Op. 1 No. 1',
        artist: 'M. Carcassi (1792–1853)',
        format: 'midi',
        licence: 'Creative Commons Attribution-ShareAlike 4.0',
        open: true,
        detail: 'Guitar · Classical',
        url: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=2165',
      },
    ]);
  });
  it('downloads only paths under its archive', async () => {
    const fetched = answer(new Uint8Array([1, 2, 3]));
    await mutopia.file!('CarcassiM/O1/x/x.mid', signal);
    expect(String(fetched.mock.calls[0][0])).toBe(
      'https://www.mutopiaproject.org/ftp/CarcassiM/O1/x/x.mid',
    );
    for (const id of ['../secret.mid', 'a/../../b.mid', 'https://evil.example/x.mid', 'a/b.ly'])
      await expect(mutopia.file!(id, signal)).rejects.toThrow('Unknown Mutopia file');
    expect(fetched).toHaveBeenCalledTimes(1);
  });
});

describe('BitMidi', () => {
  it('tidies file names and marks results as unlicensed', async () => {
    answer(
      JSON.stringify({
        result: {
          results: [{ id: 16424, name: 'beatles-cant_buy_me_love.mid', slug: 'b-mid' }, {}],
        },
      }),
    );
    expect(await bitmidi.search('beatles', signal)).toEqual([
      expect.objectContaining({
        id: '16424',
        title: 'beatles cant buy me love',
        format: 'midi',
        open: false,
        url: 'https://bitmidi.com/b-mid',
      }),
    ]);
  });
  it('rejects ids that are not numbers and unexpected answers', async () => {
    await expect(bitmidi.file!('1/../../x', signal)).rejects.toThrow('Unknown BitMidi file');
    answer('{"result":{}}');
    await expect(bitmidi.search('x', signal)).rejects.toThrow('unexpected');
  });
});

describe('Songsterr', () => {
  it('returns links only, never a loadable file', async () => {
    answer(
      JSON.stringify([
        {
          songId: 269,
          title: 'Smells Like Teen Spirit',
          artist: 'Nirvana',
          tracks: [{ instrumentId: 30 }, { instrumentId: 34 }, { instrumentId: 1024 }],
        },
      ]),
    );
    expect(await songsterr.search('nirvana', signal)).toEqual([
      expect.objectContaining({
        format: 'link',
        open: false,
        detail: 'Tab · guitar, bass, drums',
        url: 'https://www.songsterr.com/a/wa/song?id=269',
      }),
    ]);
    expect(songsterr.file).toBeUndefined();
  });
});

describe('downloads', () => {
  it('refuses error answers and oversized bodies', async () => {
    answer('no', { status: 404 });
    await expect(download('https://example.test/x', signal)).rejects.toThrow('answered 404');
    vi.restoreAllMocks();
    answer(new Uint8Array(64));
    await expect(download('https://example.test/x', signal, 16)).rejects.toThrow('too large');
  });
});
