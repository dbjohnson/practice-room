import { createReadStream, existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { csvRows } from '../csv';
import { sourceData } from './provider';

const families = [
  'piano',
  'tuned percussion',
  'organ',
  'guitar',
  'bass',
  'strings',
  'ensemble',
  'brass',
  'reed',
  'flute',
  'synth',
  'synth',
  'synth',
  'folk',
  'percussion',
  'effects',
];
const value = (text: string) => (text === 'NA' ? '' : text.trim());

/**
 * Builds the search index from PDMX.csv. Only valid, de-duplicated scores without a licence
 * conflict are kept. Licences are what each uploader declared on MuseScore, not verified.
 */
export async function buildPdmxIndex(csv: string, target: string) {
  const building = `${target}.building`;
  rmSync(building, { force: true });
  const db = new DatabaseSync(building);
  db.exec(`
    CREATE TABLE scores (id INTEGER PRIMARY KEY, mxl TEXT NOT NULL, title TEXT NOT NULL,
      artist TEXT NOT NULL, licence TEXT NOT NULL, page TEXT NOT NULL, bars INTEGER NOT NULL,
      instruments TEXT NOT NULL, rating REAL NOT NULL, views INTEGER NOT NULL);
    CREATE VIRTUAL TABLE scores_fts USING fts5(title, artist, extra, content='',
      tokenize='unicode61 remove_diacritics 2');
    BEGIN;`);
  const score = db.prepare('INSERT INTO scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const text = db.prepare(
    'INSERT INTO scores_fts (rowid, title, artist, extra) VALUES (?, ?, ?, ?)',
  );
  let id = 0;
  for await (const row of csvRows(createReadStream(csv, 'utf8'))) {
    const keep = ['subset:all_valid', 'subset:no_license_conflict', 'subset:deduplicated'];
    if (keep.some((flag) => row[flag] !== 'True') || !/^\.\/mxl\/[\w/]+\.mxl$/.test(row.mxl))
      continue;
    const instruments = [
      ...new Set(
        row.tracks
          .split('-')
          .filter((program) => /^\d+$/.test(program))
          .map((program) => families[Number(program) >> 3] ?? 'other'),
      ),
    ].join(', ');
    const title = value(row.title) || value(row.song_name) || 'Untitled',
      artist = value(row.artist_name) || value(row.composer_name),
      page = /\/(\d+)\.json$/.exec(row.metadata)?.[1];
    score.run(
      ++id,
      row.mxl.slice(2),
      title,
      artist,
      row.license === 'cc-zero' ? 'CC0' : 'Public domain',
      page ? `https://musescore.com/score/${page}` : '',
      Math.round(Number(row['song_length.bars'])) || 0,
      instruments,
      Number(row.rating) || 0,
      Number(row.n_views) || 0,
    );
    text.run(
      id,
      title,
      [artist, value(row.composer_name)].join(' '),
      [
        value(row.song_name),
        value(row.genres),
        value(row.tags).replace(/-/g, ' '),
        instruments,
      ].join(' '),
    );
  }
  db.exec('COMMIT;');
  db.close();
  renameSync(building, target);
  return id;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? sourceData('pdmx'));
  const csv = resolve(dir, 'PDMX.csv');
  if (!existsSync(csv) || !existsSync(resolve(dir, 'mxl'))) {
    console.error(
      `PDMX is not downloaded. See docs/sources.md, then place PDMX.csv and the extracted mxl/ folder in ${dir}`,
    );
    process.exit(1);
  }
  console.log(
    `Indexed ${await buildPdmxIndex(csv, resolve(dir, 'index.sqlite'))} scores in ${dir}`,
  );
}
