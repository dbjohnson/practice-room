import { describe, expect, it } from 'vitest';
import { studies } from '../../src/music/catalog';
import { createScore } from '../../src/music/createScore';
import { editableScore, prepareRevision } from '../../src/music/scoreRevision';
import { loadScore } from '../../src/music/loadScore';
import { importBytes } from '../../src/music/importScore';
import { editHistory, latestVersions, pieceVersions } from '../../src/domain/revisions';
import { alphaTexErrors } from '../../src/server/generate';

const revised = '\\title "Revised riff"\n\\tempo 100\n:4 0.6 3.6 5.6 3.6 |';

describe('score versions', () => {
  it('exports every instrument for editing, including piano and drums', () => {
    const score = createScore(studies[0], studies[0].recipe!);
    const tex = editableScore(score);
    expect(alphaTexErrors(tex)).toEqual([]);
    const roundtrip = loadScore(new TextEncoder().encode(tex));
    expect(roundtrip.tracks.map((t) => t.name)).toEqual(score.tracks.map((t) => t.name));
    expect(roundtrip.tracks.at(-1)!.staves[0].isPercussion).toBe(true);
    expect(roundtrip.masterBars).toHaveLength(score.masterBars.length);
  });
  it('saves an original snapshot, makes independent versions and branches from an older version', async () => {
    const original = studies[0];
    const score = createScore(original, original.recipe!);
    const first = await prepareRevision(
      original,
      score,
      [original],
      revised,
      'Simplify it',
      'test/model',
    );
    expect(first.original.id).not.toBe(original.id);
    expect(first.original.source).toBe('import');
    const restored = loadScore(new Uint8Array(first.buffers[0].buffer));
    expect(restored.tracks).toHaveLength(score.tracks.length);
    expect(restored.masterBars).toHaveLength(score.masterBars.length);
    expect(first.piece.revision).toMatchObject({
      number: 2,
      parentId: first.original.id,
      model: 'test/model',
    });
    const second = await prepareRevision(
      first.original,
      restored,
      [first.original, first.piece],
      revised,
      'A different edit',
      'test/model',
    );
    expect(second.buffers).toHaveLength(1);
    expect(second.piece.id).not.toBe(first.piece.id);
    expect(second.piece.revision).toMatchObject({ number: 3, parentId: first.original.id });
    const pieces = [first.original, first.piece, second.piece];
    expect(latestVersions(pieces)).toEqual([second.piece]);
    expect(pieceVersions(pieces, second.piece)).toHaveLength(3);
    expect(editHistory(pieces, second.piece)).toEqual(['A different edit']);
  });
  it('keeps imported source bytes and attribution untouched', async () => {
    const imported = await importBytes(
      'original.alphatex',
      new TextEncoder().encode(revised).buffer,
      {
        source: 'mutopia',
        name: 'Mutopia',
        id: 'source',
        licence: 'CC',
        url: 'https://example.test',
      },
    );
    const version = await prepareRevision(
      imported.piece,
      imported.score,
      [imported.piece],
      revised,
      'Use a slower tempo',
      'test/model',
    );
    expect(version.original.id).toBe(imported.piece.id);
    expect(version.buffers.map((b) => b.id)).toEqual([version.piece.id]);
    expect(version.piece.origin).toEqual(imported.piece.origin);
    expect(imported.piece.revision).toBeUndefined();
  });
});
