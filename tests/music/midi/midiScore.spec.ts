import { describe, expect, it } from 'vitest';
import { model } from '@coderline/alphatab';
import { midiToScore } from '../../../src/music/midi/midiScore';
import { parseMidi } from '../../../src/music/midi/parseMidi';
import { loadScore } from '../../../src/music/loadScore';
import { meter, midiFile, name, note, program, tempo } from './midiFixture';

const beats = (score: model.Score, track = 0) =>
  score.tracks[track].staves[0].bars.map((bar) =>
    bar.voices[0].beats.map((beat) => ({
      duration: beat.duration,
      dots: beat.dots,
      tuplet: beat.tupletNumerator,
      notes: beat.notes.map((n) => n.realValue),
      tied: beat.notes.some((n) => n.isTieDestination),
    })),
  );

describe('MIDI parsing', () => {
  it('normalises ticks and reads tempo, meter, names and programs', () => {
    const song = parseMidi(
      midiFile([
        [name('Riff'), tempo(96), meter(3, 4)],
        [name('Lead'), program(1, 29), ...note(240, 240, 64, 1)],
      ]),
    );
    expect(song.title).toBe('Riff');
    expect(song.tempos[0].bpm).toBeCloseTo(96, 3);
    expect(song.meters[0]).toMatchObject({ numerator: 3, denominator: 4 });
    expect(song.parts).toMatchObject([
      { name: 'Lead', program: 29, channel: 1, notes: [{ start: 480, end: 960, midi: 64 }] },
    ]);
  });
  it('rejects damaged, empty and timecode files with actionable messages', () => {
    expect(() => parseMidi(new Uint8Array(40))).toThrow('could not be read');
    expect(() => parseMidi(midiFile([[tempo(100)]]))).toThrow('does not contain any notes');
    const timecode = midiFile([note(0, 100, 60)]);
    timecode[12] = 0xe7;
    expect(() => parseMidi(timecode)).toThrow('timecode');
  });
});

describe('MIDI notation', () => {
  it('writes straight rhythms, rests and ties across the bar line', () => {
    const score = midiToScore(
      midiFile([
        [tempo(100)],
        // Slightly early and late notes still land on the grid.
        [...note(0, 470, 60), ...note(485, 230, 62), ...note(1440, 960, 64)],
      ]),
    );
    expect(score.masterBars).toHaveLength(2);
    expect(score.masterBars[0].tempoAutomations[0].value).toBe(100);
    const [first, second] = beats(score);
    const plain = { dots: 0, tuplet: -1, tied: false };
    expect(first).toEqual([
      { ...plain, duration: model.Duration.Quarter, notes: [60] },
      { ...plain, duration: model.Duration.Eighth, notes: [62] },
      { ...plain, duration: model.Duration.Eighth, notes: [] },
      { ...plain, duration: model.Duration.Quarter, notes: [] },
      { ...plain, duration: model.Duration.Quarter, notes: [64] },
    ]);
    expect(second).toEqual([
      { ...plain, duration: model.Duration.Quarter, notes: [64], tied: true },
      { ...plain, duration: model.Duration.Half, notes: [] },
      { ...plain, duration: model.Duration.Quarter, notes: [] },
    ]);
  });
  it('recognises eighth-note triplets beside straight beats', () => {
    const score = midiToScore(
      midiFile([
        [...note(0, 160, 60), ...note(160, 160, 62), ...note(320, 160, 64), ...note(480, 480, 65)],
      ]),
    );
    const [bar] = beats(score);
    expect(bar.slice(0, 4)).toMatchObject([
      { duration: model.Duration.Eighth, tuplet: 3, notes: [60] },
      { duration: model.Duration.Eighth, tuplet: 3, notes: [62] },
      { duration: model.Duration.Eighth, tuplet: 3, notes: [64] },
      { duration: model.Duration.Quarter, tuplet: -1, notes: [65] },
    ]);
  });
  it('gives guitar and bass parts tablature and keeps drums as percussion', () => {
    const score = midiToScore(
      midiFile([
        [program(0, 27), ...note(0, 480, 40), ...note(0, 480, 47), ...note(0, 480, 52)],
        [program(1, 33), ...note(0, 480, 28, 1)],
        [...note(0, 120, 36, 9)],
        [program(2, 0), ...note(0, 480, 72, 2)],
      ]),
    );
    const [guitar, bass, piano, drums] = score.tracks;
    expect(guitar.staves[0].showTablature).toBe(true);
    expect(
      guitar.staves[0].bars[0].voices[0].beats[0].notes.map((n) => [n.string, n.fret]),
    ).toEqual([
      [1, 0],
      [2, 2],
      [3, 2],
    ]);
    expect(bass.staves[0].stringTuning.tunings).toEqual([43, 38, 33, 28]);
    expect(bass.staves[0].bars[0].clef).toBe(model.Clef.F4);
    expect(piano.staves[0].showTablature).toBe(false);
    expect(drums.staves[0].isPercussion).toBe(true);
    expect(drums.playbackInfo.primaryChannel).toBe(9);
  });
  it('follows meter changes and refuses scores that are too long', () => {
    const score = midiToScore(
      midiFile([
        [meter(3, 4), meter(4, 4, 1440)],
        [...note(0, 480, 60), ...note(1440, 1920, 62)],
      ]),
    );
    expect(score.masterBars.map((bar) => bar.timeSignatureNumerator)).toEqual([3, 4]);
    expect(() => midiToScore(midiFile([note(480 * 4 * 2001, 480, 60)]))).toThrow('2,000');
  });
  it('is chosen by the shared loader for MIDI bytes', () => {
    expect(loadScore(midiFile([note(0, 480, 60)])).tracks).toHaveLength(1);
  });
});
