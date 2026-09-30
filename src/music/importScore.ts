import { importer, model, Settings } from '@coderline/alphatab';
import type { Piece } from '../domain/types';

export async function importScore(
  file: File,
): Promise<{ piece: Piece; score: model.Score; bytes: ArrayBuffer; warnings: string[] }> {
  if (!/\.(gp[345]?|gpx|musicxml|xml|mxl)$/i.test(file.name))
    throw new Error(
      'Choose a Guitar Pro (.gp3–.gp5, .gpx, .gp) or MusicXML (.xml, .musicxml, .mxl) file.',
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      'This prototype accepts scores up to 20 MB. Remove embedded audio or export MusicXML to make a smaller file.',
    );
  const bytes = await file.arrayBuffer();
  let score: model.Score;
  try {
    score = importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes), new Settings());
  } catch {
    throw new Error(
      'This score could not be read. Try another Guitar Pro version or a MusicXML export.',
    );
  }
  if (!score.tracks.length || !score.masterBars.length)
    throw new Error('This file does not contain a playable track.');
  if (score.masterBars.length > 2000)
    throw new Error('Choose a score with fewer than 2,000 measures for this prototype.');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const id =
    'import-' +
    Array.from(new Uint8Array(hash))
      .slice(0, 16)
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  const title = score.title.trim() || file.name.replace(/\.[^.]+$/, '');
  const warnings = ['Check the selected part, tuning and expressive notation against your source.'];
  if (score.backingTrack)
    warnings.push(
      'An embedded recording was found. This prototype plays the generated instruments; recording synchronization comes later.',
    );
  if (score.masterBars.some((bar) => bar.repeatCount > 0))
    warnings.push('Section loops start at the first occurrence of a measure.');
  return {
    piece: {
      id,
      title,
      subtitle: score.artist || 'Your imported score',
      source: 'import',
      bpm: score.tempo || 80,
      bars: score.masterBars.length,
      key: 'Imported',
      tags: [file.name.split('.').at(-1)?.toUpperCase() ?? 'SCORE', `${score.tracks.length} parts`],
      color: 'sand',
      filename: file.name,
    },
    score,
    bytes,
    warnings,
  };
}
