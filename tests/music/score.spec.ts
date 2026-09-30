import { describe, expect, it } from 'vitest';
import { model } from '@coderline/alphatab';
import { createScore } from '../../src/music/createScore';
import { studies } from '../../src/music/catalog';
import { expectedNotes } from '../../src/music/scoreTimeline';

describe('playable original studies', () => {
  it.each(studies.map((piece) => [piece.title, piece] as const))(
    '%s has complete, aligned bars in all four parts',
    (_, piece) => {
      const score = createScore(piece, piece.recipe!);
      expect(score.tracks).toHaveLength(4);
      expect(score.tempo).toBe(piece.bpm);
      expect(score.masterBars).toHaveLength(piece.bars);
      for (const track of score.tracks) {
        expect(track.staves[0].bars).toHaveLength(piece.bars);
        for (const bar of track.staves[0].bars)
          expect(bar.voices[0].beats.reduce((sum, b) => sum + b.playbackDuration, 0)).toBe(3840);
      }
    },
  );
  it('marks shuffled eighths and keeps chords and drums ungraded', () => {
    const score = createScore(studies[0], studies[0].recipe!);
    expect(score.masterBars[0].tripletFeel).toBe(model.TripletFeel.Triplet8th);
    expect(expectedNotes(score, 0, { start: 1, end: 2 })).toHaveLength(16);
    expect(expectedNotes(score, 1, { start: 1, end: 2 }).every((n) => n.eligible)).toBe(true);
    expect(expectedNotes(score, 2, { start: 1, end: 2 }).some((n) => n.eligible)).toBe(false);
    expect(expectedNotes(score, 3, { start: 1, end: 2 }).some((n) => n.eligible)).toBe(false);
    expect(expectedNotes(score, 9, { start: 1, end: 2 })).toEqual([]);
  });
});
