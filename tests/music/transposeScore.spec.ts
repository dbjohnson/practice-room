import { describe, expect, it } from 'vitest';
import { midi, model } from '@coderline/alphatab';
import { transposeScore, scoreKey } from '../../src/music/transposeScore';
import { createScore } from '../../src/music/createScore';
import { studies } from '../../src/music/catalog';
import { expectedNotes } from '../../src/music/scoreTimeline';

const notes = (score: model.Score, track: number) =>
  score.tracks[track].staves.flatMap((staff) =>
    staff.bars.flatMap((bar) =>
      bar.voices.flatMap((voice) => voice.beats.flatMap((beat) => beat.notes)),
    ),
  );
function events(score: model.Score) {
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(score, null, new midi.AlphaSynthMidiFileHandler(file)).generate();
  return file.tracks
    .flatMap((track) => track.events)
    .filter((event): event is midi.NoteOnEvent => event instanceof midi.NoteOnEvent)
    .map((event) => ({ tick: event.tick, channel: event.channel, pitch: event.noteKey }));
}
describe('key transposition', () => {
  it.each([-12, -3, -1, 1, 3, 12])(
    'moves every pitched note by %i semitones, preserving drums, time and source',
    (amount) => {
      const source = createScore(studies[0], studies[0].recipe!);
      const before = model.JsonConverter.scoreToJson(source);
      const { score } = transposeScore(source, amount, true);
      for (const track of source.tracks) {
        const old = notes(source, track.index),
          moved = notes(score, track.index);
        expect(moved.map((n) => n.realValue)).toEqual(
          old.map((n) => n.realValue + (track.isPercussion ? 0 : amount)),
        );
        for (const note of moved.filter((n) => n.isStringed))
          expect(note.fret).toBeGreaterThanOrEqual(0);
      }
      expect(events(score)).toEqual(
        events(source).map((event) => ({
          ...event,
          pitch: event.pitch + (event.channel === 9 ? 0 : amount),
        })),
      );
      expect(expectedNotes(score, 0, { start: 1, end: 8 }).map((n) => n.midi)).toEqual(
        expectedNotes(source, 0, { start: 1, end: 8 }).map((n) => n.midi + amount),
      );
      expect(model.JsonConverter.scoreToJson(source)).toBe(before);
      expect(transposeScore(source, 0).score).toBe(source);
    },
  );
  it('updates key signatures, written chord names, slash chords and playable diagrams', () => {
    const source = createScore(studies[0], studies[0].recipe!);
    const chord = new model.Chord();
    chord.name = 'Bm7/F#';
    chord.strings = [2, 3, 2, 4, 2, -1];
    chord.firstFret = 2;
    chord.barreFrets = [2];
    chord.showDiagram = true;
    source.tracks[0].staves[0].addChord('test', chord);
    const { score } = transposeScore(source, 3, true);
    expect(scoreKey(score).label).toBe('C major');
    expect(score.tracks[0].staves[0].bars.every((b) => b.keySignature === 0)).toBe(true);
    expect(score.tracks[0].staves[0].bars[0].voices[0].beats[0].text).toBe('Dm7');
    expect(score.tracks[0].staves[0].getChord('test')).toMatchObject({
      name: 'Dm7/A',
      strings: [5, 6, 5, 7, 5, -1],
      barreFrets: [5],
    });
  });
  it('keeps exact pitches in notation when the original tuning cannot reach the new key', () => {
    const source = createScore(studies[0], studies[0].recipe!);
    const { score, warnings } = transposeScore(source, -12, true);
    expect(warnings.length).toBeGreaterThan(0);
    expect(score.tracks[1].staves[0].showTablature).toBe(false);
    expect(score.tracks[1].staves[0].tuning).toEqual([]);
  });
});
