import { describe, expect, it } from 'vitest';
import { midi, model, type AlphaTabApi } from '@coderline/alphatab';
import { applySwing, swingTick, writtenSwing } from '../../src/music/swing';
import { createScore } from '../../src/music/createScore';
import { createRecipe } from '../../src/music/jam';
import { studies } from '../../src/music/catalog';
import { expectedNotes } from '../../src/music/scoreTimeline';
import { naturalPlayback } from '../../src/audio/naturalPlayback';

function generate(score: model.Score) {
  const file = new midi.MidiFile();
  const generator = new midi.MidiFileGenerator(
    score,
    null,
    new midi.AlphaSynthMidiFileHandler(file),
  );
  generator.generate();
  return { file, api: { tickCache: generator.tickLookup } as AlphaTabApi };
}

const events = (file: midi.MidiFile) => file.tracks.flatMap((track) => track.events);

describe('adjustable swing', () => {
  it('ranges continuously from even eighths through triplets to dotted swing', () => {
    expect([0, 25, 50, 75, 100].map((amount) => swingTick(480, amount))).toEqual([
      480, 576, 640, 686, 720,
    ]);
    for (const amount of [0, 25, 50, 75, 100]) {
      for (const tick of [0, 960, 1920, 3840, 7680]) expect(swingTick(tick, amount)).toBe(tick);
      const ticks = Array.from({ length: 97 }, (_, i) => swingTick(i * 10, amount));
      expect(ticks.every((tick, i) => i === 0 || tick > ticks[i - 1])).toBe(true);
    }
  });

  it.each(['straight', 'shuffle', 'bossa'] as const)(
    'keeps %s audio, cursor and practice targets aligned at slow and fast tempos',
    (feel) => {
      for (const bpm of [30, 240])
        for (const amount of [0, 25, 50, 100]) {
          const recipe = createRecipe('A', 'ii-V-I', feel, bpm);
          const score = createScore(studies[0], recipe);
          applySwing(score, amount);
          const { file, api } = generate(score);
          naturalPlayback(file, recipe);
          for (const track of score.tracks)
            for (const bar of track.staves[0].bars) {
              const beats = bar.voices[0].beats;
              expect(beats[0].playbackStart).toBe(0);
              expect(beats.at(-1)!.playbackStart + beats.at(-1)!.playbackDuration).toBe(3840);
              expect(beats.reduce((sum, beat) => sum + beat.playbackDuration, 0)).toBe(3840);
            }
          for (const [track, channel] of [0, 2].entries()) {
            const attacks = events(file).filter(
              (event) => event instanceof midi.NoteOnEvent && event.channel === channel,
            );
            expect(attacks.map((event) => event.tick)).toEqual(
              expectedNotes(score, track, { start: 1, end: 8 }, api).map((note) => note.tick),
            );
          }
          const guitar = score.tracks[0].staves[0].bars[0].voices[0].beats;
          expect(api.tickCache!.getBeatStart(guitar[1])).toBe(swingTick(480, amount));
          expect(api.tickCache!.getMasterBar(score.masterBars[3]).end).toBe(15360);
          expect(score.tempo).toBe(bpm);
        }
    },
  );

  it('changes duration and offbeat chord starts without accumulating timing drift', () => {
    const recipe = createRecipe('A', 'ii-V-I', 'bossa', 90);
    const score = createScore(studies[0], recipe);
    const original = JSON.stringify(events(generate(score).file));
    applySwing(score, 100);
    const heavy = JSON.stringify(events(generate(score).file));
    applySwing(score, 25);
    applySwing(score, 100);
    expect(JSON.stringify(events(generate(score).file))).toBe(heavy);
    applySwing(score, null);
    expect(JSON.stringify(events(generate(score).file))).toBe(original);
    expect(writtenSwing(score)).toBe(0);
  });

  it('restores authored shuffle exactly and preserves explicit tuplets', () => {
    const score = createScore(studies[0], studies[0].recipe!);
    const original = JSON.stringify(events(generate(score).file));
    applySwing(score, 0);
    expect(writtenSwing(score)).toBe(50);
    applySwing(score, null);
    expect(JSON.stringify(events(generate(score).file))).toBe(original);
    const beat = score.tracks[0].staves[0].bars[0].voices[0].beats[1];
    beat.tupletNumerator = 3;
    beat.tupletDenominator = 2;
    const start = beat.playbackStart,
      duration = beat.playbackDuration;
    applySwing(score, 100);
    expect(beat.playbackStart).toBe(start);
    expect(beat.playbackDuration).toBe(duration);
  });
});
