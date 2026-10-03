import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ftsQuery, pdmx } from '../../../src/server/sources/pdmx';
import { buildPdmxIndex } from '../../../src/server/sources/pdmxIndex';

const header =
  'metadata,mxl,license,genres,tags,song_name,title,artist_name,composer_name,tracks,song_length.bars,rating,n_views,subset:all_valid,subset:no_license_conflict,subset:deduplicated';
const row = (id: number, title: string, artist: string, tracks: string, flags = 'True,True,True') =>
  `./metadata/1/${id}.json,./mxl/1/${id}.mxl,cc-zero,classical,study-etude,NA,"${title.replace(/"/g, '""')}",${artist},NA,${tracks},16,4.5,100,${flags}`;
let dir: string;
const signal = new AbortController().signal;
beforeAll(async () => {
  dir = mkdtempSync(resolve(tmpdir(), 'pdmx-'));
  mkdirSync(resolve(dir, 'mxl/1'), { recursive: true });
  writeFileSync(resolve(dir, 'mxl/1/11.mxl'), 'score-bytes');
  writeFileSync(
    resolve(dir, 'PDMX.csv'),
    [
      header,
      row(11, 'Étude in A minor, "Spanish"', 'Tárrega', '24'),
      row(12, 'Walking line', 'Anon', '0-33'),
      row(13, 'Conflicted', 'Anon', '24', 'True,False,True'),
      row(14, 'Duplicate', 'Anon', '24', 'True,True,False'),
    ].join('\n'),
  );
  expect(await buildPdmxIndex(resolve(dir, 'PDMX.csv'), resolve(dir, 'index.sqlite'))).toBe(2);
});
afterAll(() => rmSync(dir, { recursive: true }));

describe('PDMX source', () => {
  it('is unavailable until indexed', () => {
    expect(pdmx(resolve(dir, 'missing')).ready()).toBe(false);
    expect(pdmx(dir).ready()).toBe(true);
  });
  it('matches titles, artists, tags and instruments by prefix, ignoring accents', async () => {
    const source = pdmx(dir);
    expect((await source.search('etude tarrega', signal)).map((hit) => hit.title)).toEqual([
      'Étude in A minor, "Spanish"',
    ]);
    const [bass] = await source.search('bass', signal);
    expect(bass).toMatchObject({
      title: 'Walking line',
      format: 'musicxml',
      open: false,
      detail: 'piano, bass · 16 bars',
      url: 'https://musescore.com/score/12',
    });
    expect(bass.licence).toContain('declared by its uploader');
    expect(await source.search('conflicted', signal)).toEqual([]);
    expect(await source.search('"); DROP', signal)).toEqual([]);
    expect(ftsQuery('  Bach: gui* ')).toBe('"bach"* "gui"*');
  });
  it('serves only indexed files', async () => {
    const source = pdmx(dir);
    const [hit] = await source.search('etude', signal);
    expect(Buffer.from((await source.file!(hit.id, signal)).bytes).toString()).toBe('score-bytes');
    await expect(source.file!('999', signal)).rejects.toThrow('Unknown PDMX score');
    await expect(source.file!('../x', signal)).rejects.toThrow('Unknown PDMX score');
  });
});
