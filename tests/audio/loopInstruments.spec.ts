import { readFileSync } from 'node:fs';
import { midi, Settings, type AlphaTabApi, type synth } from '@coderline/alphatab';
import { expect, it } from 'vitest';
import { createScore } from '../../src/music/createScore';
import { studies } from '../../src/music/catalog';
import { requiredSamples } from '../../src/audio/requiredSamples';
import { assembleSamples } from '../../src/audio/soundfont/assembleSamples';
import { splitSamples } from '../../src/audio/soundfont/splitSamples';
import { woodblockSoundFont } from '../../src/audio/soundfont/woodblockSoundFont';
import { bandSoundFont } from '../../src/audio/soundfont/bandSoundFont';
import manifest from '../../src/audio/assets/band-manifest.json';
import { silentPlayer } from './soundfont/renderAudio';
import { naturalPlayback } from '../../src/audio/naturalPlayback';
import { renderLoopStems } from '../../src/audio/renderLoopStems';

it.each([false, true])(
  'renders every band part with real instruments (selective: %s)',
  async (selective) => {
    const piece = studies.find((p) => p.id === 'blue-hour')!;
    const score = createScore(piece, piece.recipe!);
    const settings = new Settings();
    const options = {
      score,
      recipe: piece.recipe,
      tempo: piece.bpm,
      track: 0,
      mode: 'listen' as const,
      click: false,
      muted: [],
      volumes: {},
      effects: { compression: 30, reverb: 40 },
      range: { start: 1, end: piece.bars },
    };
    const base = woodblockSoundFont(
      readFileSync(new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab'))),
      readFileSync('src/audio/assets/woody-block.wav'),
    );
    const bank = bandSoundFont(base, manifest, (file) => readFileSync(`src/audio/assets/${file}`));
    const split = splitSamples(bank);
    const ids = requiredSamples(split.manifest, options, settings);
    const selected = assembleSamples(
      split.template,
      new Map(ids.map((id) => [id, { ...split.manifest.samples[id], bytes: split.files[id] }])),
    );
    const player = silentPlayer();
    player.loadSoundFont(selective ? selected : bank, false);
    const original = new midi.MidiFile();
    const generator = new midi.MidiFileGenerator(
      score,
      settings,
      new midi.AlphaSynthMidiFileHandler(original),
    );
    generator.generate();
    naturalPlayback(original, piece.recipe);
    player.loadMidiFile(original);
    const api = {
      player: { instance: player },
      settings,
      tickCache: generator.tickLookup,
      endTick: generator.tickLookup.getMasterBar(score.masterBars.at(-1)!).end,
      uiFacade: {
        createWorkerAudioExporter: (instance: unknown) => {
          // The browser facade opens a fresh, sample-less worker if handed the wrapper.
          expect(instance).toBe(player);
          let renderer: synth.IAlphaSynthAudioExporter;
          return {
            initialize: async (
              options: synth.AudioExportOptions,
              file: midi.MidiFile,
              sync: [],
              pitches: Map<number, number>,
            ) => {
              renderer = player.exportAudio(options, file, sync, pitches);
            },
            render: async (ms: number) => renderer.render(ms),
            destroy: () => {},
          };
        },
      },
    } as unknown as AlphaTabApi;
    const context = {
      sampleRate: 48000,
      createBuffer: (count: number, length: number, rate: number) => {
        const channels = Array.from({ length: count }, () => new Float32Array(length));
        return { duration: length / rate, getChannelData: (i: number) => channels[i] };
      },
    } as unknown as AudioContext;
    try {
      const audio = await renderLoopStems(api, options, context, new AbortController().signal);
      for (const stem of audio.stems) {
        const samples = stem.buffer.getChannelData(0);
        expect(samples.every(Number.isFinite), score.tracks[stem.track].name).toBe(true);
        const peak = samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
        expect(peak, score.tracks[stem.track].name).toBeGreaterThan(0.001);
      }
    } finally {
      player.destroy();
    }
  },
  // Full-bank synthesis under coverage is CPU-heavy on shared dev machines.
  120000,
);
