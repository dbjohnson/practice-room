import { midi, type AlphaTabApi, type model } from '@coderline/alphatab';
import { vi } from 'vitest';
import { studies } from '../../src/music/catalog';
import { createScore } from '../../src/music/createScore';
import { expectedNotes, playbackRange } from '../../src/music/scoreTimeline';

export function takeFixture(existingScore?: model.Score) {
  const piece = studies[2];
  const score = existingScore ?? createScore(piece, piece.recipe!);
  const generator = new midi.MidiFileGenerator(
    score,
    null,
    new midi.AlphaSynthMidiFileHandler(new midi.MidiFile()),
  );
  generator.generate();
  const player = {
    isReadyForPlayback: true,
    tickCache: generator.tickLookup,
    tickPosition: 0,
    stop: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(() => true),
  };
  const options = {
    piece,
    score,
    track: 1,
    tempo: 60,
    range: { start: 2, end: 2 },
    api: { current: player as unknown as AlphaTabApi | null },
    notify: vi.fn(),
  };
  const notes = expectedNotes(score, options.track, options.range, options.api.current);
  const range = playbackRange(options.api.current!, score, options.range)!;
  return { options, player, notes, ...range };
}
