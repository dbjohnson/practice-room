import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SourceHit } from '../../domain/sources';
import { sourceData, type SourceProvider } from './provider';

interface Row {
  id: number;
  mxl: string;
  title: string;
  artist: string;
  licence: string;
  page: string;
  bars: number;
  instruments: string;
}

/** Every word must match, as a prefix, so "bach gui" finds Bach pieces with a guitar part. */
export const ftsQuery = (query: string) =>
  (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 8)
    .map((word) => `"${word}"*`)
    .join(' ');

/** PDMX: public-domain and CC0 MuseScore uploads, searched in a local index built on the server. */
export function pdmx(dir = sourceData('pdmx')): SourceProvider {
  const index = resolve(dir, 'index.sqlite');
  let db: DatabaseSync | null = null;
  const open = () => (db ??= new DatabaseSync(index, { readOnly: true }));
  return {
    id: 'pdmx',
    name: 'PDMX',
    note: 'MuseScore uploads their authors marked public domain or CC0. MusicXML, opens as written.',
    ready: () => existsSync(index),
    async search(query) {
      const match = ftsQuery(query);
      if (!match) return [];
      const rows = open()
        .prepare(
          `SELECT s.* FROM scores_fts JOIN scores s ON s.id = scores_fts.rowid
           WHERE scores_fts MATCH ?
           ORDER BY bm25(scores_fts, 8.0, 4.0, 1.0) - s.rating * 0.4 - min(s.views, 5000) / 5000.0
           LIMIT 20`,
        )
        .all(match) as unknown as Row[];
      return rows.map((row): SourceHit => ({
        source: 'pdmx',
        id: String(row.id),
        title: row.title,
        artist: row.artist,
        format: 'musicxml',
        licence: `${row.licence}, as declared by its uploader`,
        // The licence is the uploader's own claim; nobody at PDMX or MuseScore checked it.
        open: false,
        detail: [row.instruments, row.bars && `${row.bars} bars`].filter(Boolean).join(' · '),
        url: row.page,
      }));
    },
    async file(id) {
      const row = /^\d{1,9}$/.test(id)
        ? (open().prepare('SELECT mxl FROM scores WHERE id = ?').get(Number(id)) as
            { mxl: string } | undefined)
        : undefined;
      const root = resolve(dir, 'mxl'),
        path = row ? resolve(dir, row.mxl) : '';
      if (!row || !path.startsWith(root + sep)) throw new Error('Unknown PDMX score.');
      return { bytes: await readFile(path), filename: `${id}.mxl` };
    },
  };
}
