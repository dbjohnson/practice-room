import { exporter, type model } from '@coderline/alphatab';
import type { Piece } from '../domain/types';
import { maxEditableScoreLength } from '../domain/generation';
import { pieceVersions } from '../domain/revisions';
import { scoreKey } from './transposeScore';
import { importBytes } from './importScore';

export function editableScore(score: model.Score): string {
  const tex = new exporter.AlphaTexExporter().exportToString(score);
  if (tex.length > maxEditableScoreLength)
    throw new Error('This score is too large for AI editing. Try a shorter piece.');
  return tex;
}

/** Build a new immutable version and, if needed, a snapshot of the original. */
export async function prepareRevision(
  source: Piece,
  score: model.Score,
  pieces: Piece[],
  alphaTex: string,
  prompt: string,
  modelId: string,
) {
  const createdAt = new Date().toISOString();
  const bytes: { id: string; buffer: ArrayBuffer }[] = [];
  let original = source;
  if (!source.revision) {
    // Imports already have their exact source bytes; studies/jams/exercises need a saved snapshot.
    const id = source.source === 'import' ? source.id : `version-${crypto.randomUUID()}`;
    original = {
      ...source,
      id,
      source: 'import',
      ...(source.source !== 'import'
        ? {
            bars: score.masterBars.length,
            bpm: Math.round(score.tempo) || source.bpm,
            key: scoreKey(score).label,
          }
        : {}),
      recipe: undefined,
      exercise: undefined,
      gymSet: undefined,
      filename: source.filename ?? 'original.gp',
      revision: { familyId: id, number: 1, createdAt },
    };
    if (source.source !== 'import')
      bytes.push({ id, buffer: new Uint8Array(new exporter.Gp7Exporter().export(score)).buffer });
  }
  const result = await importBytes(
    'revision.alphatex',
    new TextEncoder().encode(alphaTex).buffer,
    source.origin ?? {
      source: 'generated',
      name: 'Written for you',
      id: prompt,
      licence: 'Generated for your practice',
      url: '',
    },
  );
  const piece: Piece = {
    ...result.piece,
    id: `version-${crypto.randomUUID()}`,
    revision: {
      familyId: original.revision!.familyId,
      number:
        Math.max(1, ...pieceVersions(pieces, original).map((p) => p.revision?.number ?? 1)) + 1,
      parentId: original.id,
      createdAt,
      prompt,
      model: modelId,
    },
  };
  bytes.push({ id: piece.id, buffer: result.bytes });
  return { ...result, piece, original, buffers: bytes };
}
