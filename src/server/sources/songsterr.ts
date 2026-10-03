import type { SourceHit } from '../../domain/sources';
import { download, type SourceProvider } from './provider';

/**
 * Search and link only. Songsterr's terms reserve download, looping and slow-down for its
 * paid plan, so its note data is never loaded here; results open on songsterr.com.
 */
export const songsterr: SourceProvider = {
  id: 'songsterr',
  name: 'Songsterr',
  note: 'Guitar, bass and drum tabs. Opens on songsterr.com; its tabs cannot be loaded here.',
  ready: () => true,
  async search(query, signal) {
    const body = await download(
      `https://www.songsterr.com/api/songs?size=8&pattern=${encodeURIComponent(query)}`,
      signal,
      2 * 1024 * 1024,
    );
    const songs = JSON.parse(body.toString('utf8'));
    if (!Array.isArray(songs)) throw new Error('Songsterr returned an unexpected answer.');
    return songs
      .filter((song) => Number.isInteger(song?.songId) && typeof song.title === 'string')
      .map((song): SourceHit => {
        const tracks: { instrumentId?: number }[] = Array.isArray(song.tracks) ? song.tracks : [];
        const has = (low: number, high: number) =>
          tracks.some((t) => (t.instrumentId ?? -1) >= low && (t.instrumentId ?? -1) <= high);
        const parts = [has(24, 31) && 'guitar', has(32, 39) && 'bass', has(1024, 1024) && 'drums'];
        return {
          source: 'songsterr',
          id: String(song.songId),
          title: song.title,
          artist: typeof song.artist === 'string' ? song.artist : '',
          format: 'link',
          licence: 'Songsterr terms apply',
          open: false,
          detail: `Tab · ${parts.filter(Boolean).join(', ') || `${tracks.length} tracks`}`,
          url: `https://www.songsterr.com/a/wa/song?id=${song.songId}`,
        };
      });
  },
};
