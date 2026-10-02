import { describe, expect, it } from 'vitest';
import { midi } from '@coderline/alphatab';
import { exercisePlayback } from '../../src/audio/exercisePlayback';
import { createExerciseScore } from '../../src/music/exerciseScore';
import { starterExercises } from '../../src/music/exerciseCatalog';
import { exerciseSet } from '../../src/domain/gymPlan';
import type { ExerciseArticulation } from '../../src/domain/gym';
function play(articulation: ExerciseArticulation) {
  const score = createExerciseScore(starterExercises[0], {
    ...exerciseSet(starterExercises[0]),
    articulation,
  }).score;
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(score, null, new midi.AlphaSynthMidiFileHandler(file)).generate();
  exercisePlayback(file, articulation);
  return file.tracks.flatMap((t) => t.events);
}
describe('exercise articulation playback', () => {
  it('changes releases and emphasis without moving pitch or attack targets', () => {
    const notes = (art: ExerciseArticulation) =>
      play(art).filter((e): e is midi.NoteOnEvent => e instanceof midi.NoteOnEvent);
    const off = (art: ExerciseArticulation) =>
      play(art).find((e) => e instanceof midi.NoteOffEvent)!.tick;
    const basic = notes('even').map((e) => [e.tick, e.noteKey]);
    for (const art of ['staccato', 'legato', 'downbeat', 'offbeat', 'alternate'] as const)
      expect(notes(art).map((e) => [e.tick, e.noteKey])).toEqual(basic);
    expect(off('staccato')).toBeLessThan(off('even'));
    expect(off('even')).toBeLessThan(off('legato'));
    expect(notes('downbeat')[0].noteVelocity).toBeGreaterThan(notes('downbeat')[1].noteVelocity);
    expect(notes('alternate')[0].noteVelocity).toBeGreaterThan(notes('alternate')[1].noteVelocity);
  });
});
