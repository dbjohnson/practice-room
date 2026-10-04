import { readFileSync } from 'node:fs';
import { midi, Settings, type AlphaTabApi, type synth } from '@coderline/alphatab';
import { expect, it, vi } from 'vitest';
import { exerciseLoopMidi, renderExerciseLoop } from '../../src/audio/exerciseLoopBuffer';
import { createExerciseScore } from '../../src/music/exerciseScore';
import { starterExercises } from '../../src/music/exerciseCatalog';
import { exerciseSet } from '../../src/domain/gymPlan';
import { woodblockSoundFont } from '../../src/audio/soundfont/woodblockSoundFont';
import { silentPlayer } from './soundfont/renderAudio';

const bank = woodblockSoundFont(
  readFileSync(new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab'))),
  readFileSync('src/audio/assets/woody-block.wav'),
);
function fixture() {
  const score = createExerciseScore(starterExercises[0], exerciseSet(starterExercises[0])).score;
  const generator = new midi.MidiFileGenerator(
    score,
    null,
    new midi.AlphaSynthMidiFileHandler(new midi.MidiFile()),
  );
  generator.generate();
  const end = generator.tickLookup.getMasterBar(score.masterBars.at(-1)!).end;
  const options = {
    score,
    tempo: 120,
    track: 0,
    mode: 'along' as const,
    click: true,
    muted: [],
    volumes: {},
    effects: { compression: 0, reverb: 0 },
  };
  return {
    api: { settings: new Settings(), endTick: end, tickCache: generator.tickLookup } as AlphaTabApi,
    options,
    end,
  };
}

it('duplicates the MIDI without moving attacks and scales tempo once for both cycles', () => {
  const { api, options, end } = fixture();
  const { file, duration } = exerciseLoopMidi(api, options);
  const notes = file.events.filter((e): e is midi.NoteOnEvent => e instanceof midi.NoteOnEvent);
  const first = notes.filter((n) => n.tick < end),
    second = notes.filter((n) => n.tick >= end);
  expect(second.map((n) => [n.tick - end, n.noteKey])).toEqual(
    first.map((n) => [n.tick, n.noteKey]),
  );
  expect(duration).toBe((end / 960) * 0.5);
  const tempos = file.events.filter(
    (e): e is midi.TempoChangeEvent => e instanceof midi.TempoChangeEvent,
  );
  expect(tempos.every((e) => e.beatsPerMinute === 120)).toBe(true);
  expect(
    file.events.filter((e) => e instanceof midi.EndOfTrackEvent).every((e) => e.tick === end * 2),
  ).toBe(true);
});

it.each([false, true])(
  'renders the selected guitar unless explicitly muted (%s), without baking in the click',
  async (muted) => {
    const { api, options, end } = fixture();
    const player = silentPlayer();
    let renderer: synth.IAlphaSynthAudioExporter;
    const exporter = {
      initialize: async (
        settings: synth.AudioExportOptions,
        file: midi.MidiFile,
        sync: [],
        pitches: Map<number, number>,
      ) => {
        settings.soundFonts = [bank];
        renderer = player.exportAudio(settings, file, sync, pitches);
      },
      render: async (milliseconds: number) => renderer.render(milliseconds),
      destroy: vi.fn(),
    };
    Object.assign(api, { uiFacade: { createWorkerAudioExporter: () => exporter } });
    const channels: Float32Array[] = [];
    const context = {
      sampleRate: 48000,
      createBuffer: (count: number, length: number, rate: number) => {
        for (let i = 0; i < count; i++) channels.push(new Float32Array(length));
        return { duration: length / rate, getChannelData: (channel: number) => channels[channel] };
      },
    };
    const audio = await renderExerciseLoop(
      api,
      { ...options, muted: muted ? [0] : [] },
      context as unknown as AudioContext,
      new AbortController().signal,
    );
    expect(audio.buffer.duration).toBe((end / 960) * 0.5);
    expect(channels[0].length).toBe(Math.round(audio.buffer.duration * 48000));
    expect(channels[0].every(Number.isFinite)).toBe(true);
    // The selected part is audible in playback; only explicit mute silences it.
    expect(channels[0].every((value) => value === 0)).toBe(muted);
    expect(exporter.destroy).toHaveBeenCalledOnce();
    player.destroy();
  },
);

it('renders only the requested middle passage', async () => {
  const { api, options } = fixture();
  const range = { start: 2, end: 2 };
  const { end, timing, file } = exerciseLoopMidi(api, { ...options, range });
  expect(timing.startTick).toBe(api.tickCache!.getMasterBarStart(options.score.masterBars[1]));
  expect(end).toBe(options.score.masterBars[1].calculateDuration());
  expect(timing.duration).toBe((end / 960) * 0.5);
  const notes = file.events.filter((e) => e instanceof midi.NoteOnEvent);
  expect(notes.every((e) => e.tick >= 0 && e.tick < end * 2)).toBe(true);
});
