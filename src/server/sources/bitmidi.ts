import type { SourceHit } from '../../domain/sources';
import { download, type SourceProvider } from './provider';

const origin = 'https://bitmidi.com';
const tidy = (name: string) =>
  name
    .replace(/\.midi?$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** BitMidi's search is undocumented and its uploads carry no licence, so nothing here is `open`. */
export const bitmidi: SourceProvider = {
  id: 'bitmidi',
  name: 'BitMidi',
  note: 'Community MIDI uploads of popular songs. No licence is stated; use for personal practice.',
  ready: () => true,
  async search(query, signal) {
    const body = await download(
      `${origin}/api/midi/search?q=${encodeURIComponent(query)}&page=0`,
      signal,
      1024 * 1024,
    );
    const results = JSON.parse(body.toString('utf8'))?.result?.results;
    if (!Array.isArray(results)) throw new Error('BitMidi returned an unexpected answer.');
    return results
      .filter((item) => Number.isInteger(item?.id) && typeof item.name === 'string')
      .slice(0, 12)
      .map((item): SourceHit => ({
        source: 'bitmidi',
        id: String(item.id),
        title: tidy(item.name),
        artist: '',
        format: 'midi',
        licence: 'No licence stated',
        open: false,
        detail: 'MIDI · notated on import',
        url: `${origin}/${encodeURIComponent(String(item.slug ?? ''))}`,
      }));
  },
  async file(id, signal) {
    if (!/^\d{1,9}$/.test(id)) throw new Error('Unknown BitMidi file.');
    return { bytes: await download(`${origin}/uploads/${id}.mid`, signal), filename: `${id}.mid` };
  },
};
