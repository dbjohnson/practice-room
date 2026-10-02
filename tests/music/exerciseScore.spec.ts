import { describe, expect, it } from 'vitest';
import { midi, model } from '@coderline/alphatab';
import { scales, starterExercises } from '../../src/music/exerciseCatalog';
import { exercisePitches, parseExerciseNotes } from '../../src/music/exercisePatterns';
import { createExerciseScore } from '../../src/music/exerciseScore';
import { exerciseSet } from '../../src/domain/gymPlan';
import { rhythmLabels, type Exercise } from '../../src/domain/gym';
import { expectedNotes } from '../../src/music/scoreTimeline';
import { scoreKey } from '../../src/music/transposeScore';
const beats = (score: model.Score) =>
  score.tracks[0].staves[0].bars.flatMap((b) => b.voices[0].beats);
const pitches = (score: model.Score) =>
  beats(score).flatMap((b) => b.notes.filter((n) => !n.isTieDestination).map((n) => n.realValue));
const base = starterExercises[0];
describe('gym exercise music', () => {
  it.each(scales)('constructs $name across one, two and three octaves', (scale) => {
    for (const octaves of [1, 2, 3] as const) {
      const exercise: Exercise = {
        ...base,
        source: {
          kind: 'scale',
          scaleId: scale.id,
          key: 0,
          octaves,
          direction: 'ascending',
          pattern: 'straight',
        },
      };
      const notes = exercisePitches(exercise) as number[];
      expect(notes.at(-1)! - notes[0]).toBe(octaves * 12);
      expect(notes.length).toBe(scale.intervals.length * octaves + 1);
      expect(notes.map((n) => n % 12)).toEqual([
        ...Array.from({ length: octaves }, () => scale.intervals).flat(),
        0,
      ]);
      expect(pitches(createExerciseScore(exercise).score)).toEqual(notes);
    }
  });
  it('handles half octaves, direction, grouped patterns, rests and accidentals', () => {
    expect(parseExerciseNotes('C3 F#3 Bb2 R -')).toEqual([48, 54, 46, null, null]);
    expect(() => parseExerciseNotes('C3 potato')).toThrow();
    expect(() => parseExerciseNotes('')).toThrow();
    const exercise: Exercise = {
      ...base,
      source: {
        kind: 'scale',
        scaleId: 'ionian-major',
        key: 0,
        octaves: 0.5,
        direction: 'descending',
        pattern: 'straight',
      },
    };
    expect(exercisePitches(exercise)).toEqual([53, 52, 50, 48]);
    exercise.source = {
      ...exercise.source,
      direction: 'ascending',
      pattern: 'thirds',
    } as Exercise['source'];
    expect(exercisePitches(exercise).slice(0, 4)).toEqual([48, 52, 50, 53]);
  });
  it.each(Object.keys(rhythmLabels))('fills bars and keeps pitches for %s', (rhythm) => {
    const set = { ...exerciseSet(base), rhythm: rhythm as keyof typeof rhythmLabels };
    const { score } = createExerciseScore(base, set);
    for (const bar of score.tracks[0].staves[0].bars)
      expect(bar.voices[0].beats.reduce((n, b) => n + b.playbackDuration, 0)).toBe(3840);
    expect(pitches(score)).toEqual(exercisePitches(base));
    expect(
      expectedNotes(score, 0, { start: 1, end: score.masterBars.length }).map((n) => n.midi),
    ).toEqual(exercisePitches(base));
  });
  it('moves the actual MIDI pitches and modal tonic through fifths', () => {
    const exercise = starterExercises[1],
      set = { ...exerciseSet(exercise), keyOffset: 7 };
    const score = createExerciseScore(exercise, set).score;
    expect(scoreKey(score).pitch).toBe(9);
    expect(scoreKey(score).label).toContain('Dorian');
    const file = new midi.MidiFile();
    new midi.MidiFileGenerator(score, null, new midi.AlphaSynthMidiFileHandler(file)).generate();
    const played = file.tracks
      .flatMap((t) => t.events)
      .filter((e): e is midi.NoteOnEvent => e instanceof midi.NoteOnEvent)
      .map((e) => e.noteKey);
    expect(played).toEqual(exercisePitches(exercise).map((n) => n! + 7));
  });
  it('writes staccato, tenuto, accents and alternating pick strokes', () => {
    const get = (articulation: 'staccato' | 'legato' | 'downbeat' | 'alternate') =>
      beats(createExerciseScore(base, { ...exerciseSet(base), articulation }).score);
    expect(
      get('staccato')
        .flatMap((b) => b.notes)
        .every((n) => n.isStaccato),
    ).toBe(true);
    expect(get('legato')[0].notes[0].accentuated).toBe(model.AccentuationType.Tenuto);
    expect(
      get('downbeat')
        .slice(0, 3)
        .map((b) => b.notes[0].accentuated),
    ).toEqual([
      model.AccentuationType.Normal,
      model.AccentuationType.None,
      model.AccentuationType.Normal,
    ]);
    expect(
      get('alternate')
        .slice(0, 2)
        .map((b) => b.pickStroke),
    ).toEqual([model.PickStroke.Down, model.PickStroke.Up]);
  });
  it('extracts score passages without mutating their source', () => {
    const source = createExerciseScore(base).score;
    const before = model.JsonConverter.scoreToJson(source);
    const exercise: Exercise = {
      ...base,
      source: {
        kind: 'score',
        snapshotId: 'independent',
        track: 0,
        startBar: 2,
        endBar: 2,
        key: 0,
      },
      defaults: { ...base.defaults, rhythm: 'original' },
    };
    const result = createExerciseScore(exercise, undefined, source);
    expect(pitches(result.score)).toEqual(
      source.tracks[0].staves[0].bars[1].voices[0].beats.flatMap((b) =>
        b.notes.map((n) => n.realValue),
      ),
    );
    expect(model.JsonConverter.scoreToJson(source)).toBe(before);
  });
});
