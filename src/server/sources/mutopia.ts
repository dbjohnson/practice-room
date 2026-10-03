import type { SourceHit } from '../../domain/sources';
import { decodeHtml, download, type SourceProvider } from './provider';

const origin = 'https://www.mutopiaproject.org';
const path = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)+\.mid$/;

/** Reads Mutopia's result page: one four-row table per piece, in a stable cell order. */
export function parseMutopia(html: string): SourceHit[] {
  return html
    .split('<table class="table-bordered result-table">')
    .slice(1)
    .flatMap((table): SourceHit[] => {
      const cells = [...table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decodeHtml(m[1]));
      const file = /href="https:\/\/www\.mutopiaproject\.org\/ftp\/([^"]+\.mid)"/.exec(table)?.[1];
      const piece = /piece-info\.cgi\?id=(\d+)/.exec(table)?.[1];
      if (!file || !path.test(file) || !piece || cells.length < 10) return [];
      return [
        {
          source: 'mutopia',
          id: file,
          title: [cells[0], cells[2]].filter(Boolean).join(', '),
          artist: cells[1].replace(/^by\s+/, ''),
          format: 'midi',
          licence: cells[9] || 'See Mutopia',
          open: /public domain|creative commons/i.test(cells[9]),
          detail: [cells[4].replace(/^for\s+/, ''), cells[6]].filter(Boolean).join(' · '),
          url: `${origin}/cgibin/piece-info.cgi?id=${piece}`,
        },
      ];
    });
}

export const mutopia: SourceProvider = {
  id: 'mutopia',
  name: 'Mutopia Project',
  note: 'Classical and traditional editions, each public domain or Creative Commons. MIDI, notated on import.',
  ready: () => true,
  async search(query, signal) {
    const page = await download(
      `${origin}/cgibin/make-table.cgi?searchingfor=${encodeURIComponent(query)}`,
      signal,
      1024 * 1024,
    );
    return parseMutopia(page.toString('utf8'));
  },
  async file(id, signal) {
    if (!path.test(id)) throw new Error('Unknown Mutopia file.');
    return {
      bytes: await download(`${origin}/ftp/${id}`, signal),
      filename: id.split('/').at(-1)!,
    };
  },
};
