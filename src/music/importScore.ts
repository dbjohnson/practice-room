import type { model } from '@coderline/alphatab';
import type { PieceOrigin } from '../domain/sources';
import type { Piece } from '../domain/types';
import { loadScore } from './loadScore';
import { isMidi } from './midi/parseMidi';

export const importExtensions = [
  '.gp',
  '.gp3',
  '.gp4',
  '.gp5',
  '.gpx',
  '.xml',
  '.musicxml',
  '.mxl',
  '.mid',
  '.midi',
];
const MAX_BYTES = 20 * 1024 * 1024;
const tooLarge = () =>
  new Error(
    'This prototype accepts scores up to 20 MB. Remove embedded audio or export MusicXML to make a smaller file.',
  );
export interface ImportedScore {
  piece: Piece;
  score: model.Score;
  bytes: ArrayBuffer;
  warnings: string[];
}

/** Reads score bytes from a file or a catalogue. `origin` records where a found piece came from. */
export async function importBytes(
  filename: string,
  bytes: ArrayBuffer,
  origin?: PieceOrigin & { title?: string; artist?: string },
): Promise<ImportedScore> {
  if (bytes.byteLength > MAX_BYTES) throw tooLarge();
  const data = new Uint8Array(bytes),
    midi = isMidi(data);
  let score: model.Score;
  try {
    score = loadScore(data);
  } catch (error) {
    // The MIDI reader explains what is wrong; alphaTab's errors are not written for players.
    throw midi && error instanceof Error
      ? error
      : new Error(
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
  const title = origin?.title || score.title.trim() || filename.replace(/\.[^.]+$/, '');
  const warnings = ['Check the selected part, tuning and expressive notation against your source.'];
  if (midi)
    warnings.push(
      'Notated from MIDI: rhythms are rounded to sixteenths and triplets, each part is one voice, and fingerings are suggestions.',
    );
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
      subtitle: origin?.artist || score.artist || 'Your imported score',
      source: 'import',
      bpm: Math.round(score.tempo) || 80,
      bars: score.masterBars.length,
      key: 'Imported',
      tags: [
        origin?.source === 'generated'
          ? 'AI'
          : (filename.split('.').at(-1)?.toUpperCase() ?? 'SCORE'),
        `${score.tracks.length} parts`,
      ],
      color: 'sand',
      filename,
      ...(origin && {
        origin: {
          source: origin.source,
          name: origin.name,
          id: origin.id,
          licence: origin.licence,
          url: origin.url,
        },
      }),
    },
    score,
    bytes,
    warnings,
  };
}

export async function importScore(file: File): Promise<ImportedScore> {
  if (!importExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)))
    throw new Error(
      'Choose a Guitar Pro (.gp3–.gp5, .gpx, .gp), MusicXML (.xml, .musicxml, .mxl) or MIDI (.mid) file.',
    );
  // Checked before reading so an oversized file is never loaded into memory.
  if (file.size > MAX_BYTES) throw tooLarge();
  return importBytes(file.name, await file.arrayBuffer());
}
