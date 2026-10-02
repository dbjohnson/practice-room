import { readFileSync } from 'node:fs';
import { midi } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { bandSoundFont } from '../../../src/audio/soundfont/bandSoundFont';
import { woodblockSoundFont } from '../../../src/audio/soundfont/woodblockSoundFont';
import manifest from '../../../src/audio/assets/band-manifest.json';
import { estimatePitch } from '../../../src/audio/pitch';
import { naturalPlayback } from '../../../src/audio/naturalPlayback';
import { createScore } from '../../../src/music/createScore';
import { studies } from '../../../src/music/catalog';
import { createRecipe } from '../../../src/music/jam';
import { PlaybackEffects } from '../../../src/audio/PlaybackEffects';
import { renderAudio, renderMidi } from './renderAudio';

const base = woodblockSoundFont(
  readFileSync(new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab'))),
  readFileSync('src/audio/assets/woody-block.wav'),
);
const bank = bandSoundFont(base, manifest, (file) => readFileSync(`src/audio/assets/${file}`));
const bytes = (samples: Float32Array) => Buffer.from(samples.buffer);
const peak = (samples: Float32Array) =>
  samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const energy = (samples: Float32Array) => samples.reduce((sum, value) => sum + value * value, 0);

// Full Vorbis instrument decoding exercises the real synth, including on slower CI hosts.
describe('recorded band SoundFont', { timeout: 60000 }, () => {
  it.each([
    ['guitar', 64, 0, 27],
    ['bass', 40, 2, 33],
    ['piano', 60, 4, 0],
    ['kick', 36, 9, 0],
    ['snare', 38, 9, 0],
    ['hi-hat', 42, 9, 0],
    ['ride', 51, 9, 0],
  ] as const)('replaces %s with playable, finite audio', (_, key, channel, program) => {
    const options = { notes: [{ key, channel, program }] };
    const updated = renderAudio(bank, options);
    expect(updated.every(Number.isFinite)).toBe(true);
    expect(peak(updated)).toBeGreaterThan(0.01);
    expect(peak(updated)).toBeLessThan(1);
    expect(bytes(updated).equals(bytes(renderAudio(base, options)))).toBe(false);
  });

  it.each([
    ['woodblock', 33, 9, 0],
    ['bell', 34, 9, 0],
    ['unreplaced keys', 60, 4, 4],
    ['bass fallback', 72, 2, 33],
  ] as const)('preserves %s exactly', (_, key, channel, program) => {
    const options = { notes: [{ key, channel, program }] };
    expect(bytes(renderAudio(bank, options)).equals(bytes(renderAudio(base, options)))).toBe(true);
  });

  it.each([
    [28, 2, 33],
    [40, 2, 33],
    [52, 0, 27],
    [64, 0, 27],
    [60, 4, 0],
  ])('plays MIDI %i on channel %i at concert pitch', (key, channel, program) => {
    const samples = renderAudio(bank, { notes: [{ key, channel, program, duration: 1920 }] });
    const mono = Float32Array.from({ length: 8192 }, (_, i) => samples[(i + 4800) * 2]);
    const pitch = estimatePitch(mono, 48000);
    expect(pitch.midi).not.toBeNull();
    expect(Math.abs(pitch.midi! - key)).toBeLessThan(0.3);
  });

  it('closes the open hat when a closed hat plays, without cutting cymbals at note-off', () => {
    const open = { key: 46, channel: 9, program: 0, duration: 120 };
    const unchoked = renderAudio(bank, { notes: [open] });
    const choked = renderAudio(bank, {
      notes: [open, { key: 42, channel: 9, program: 0, tick: 480, duration: 120 }],
    });
    expect(energy(choked.subarray(48000))).toBeLessThan(energy(unchoked.subarray(48000)) * 0.1);
    const ride = renderAudio(bank, { notes: [{ key: 51, channel: 9, program: 0, duration: 120 }] });
    expect(energy(ride.subarray(48000, 96000))).toBeGreaterThan(0.01);
  });

  it('covers each replacement pitch with exactly one recording per velocity', () => {
    for (const [program, low, high] of [
      [33, 23, 67],
      [27, 40, 88],
      [0, 0, 127],
    ]) {
      const regions = manifest.filter((r) => r.bank === 0 && r.program === program);
      for (let key = low; key <= high; key++)
        for (let velocity = 1; velocity <= 127; velocity++) {
          expect(
            regions.filter(
              (r) =>
                r.low <= key &&
                r.high >= key &&
                r.velocity[0] <= velocity &&
                r.velocity[1] >= velocity,
            ),
          ).toHaveLength(1);
        }
    }
  });

  it.each(['straight', 'shuffle', 'bossa'] as const)(
    'keeps %s stems balanced with drums audible at the default faders',
    (feel) => {
      const recipe = createRecipe('A', 'ii-V-I', feel, 88);
      const score = createScore(studies[0], recipe);
      const levels = [0, 2, 4, 9].map((channel) => {
        const file = new midi.MidiFile();
        new midi.MidiFileGenerator(
          score,
          null,
          new midi.AlphaSynthMidiFileHandler(file),
        ).generate();
        naturalPlayback(file, recipe);
        for (const track of file.tracks) {
          const events = track.events.filter(
            (event) =>
              !(event instanceof midi.NoteOnEvent || event instanceof midi.NoteOffEvent) ||
              event.channel === channel,
          );
          track.events.splice(0, track.events.length, ...events);
        }
        const audio = renderMidi(bank, file, { endTick: 15360, volume: 0.8 });
        return 10 * Math.log10(energy(audio) / audio.length);
      });
      expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(6);
      expect(levels[3]).toBeGreaterThanOrEqual(levels[0] - 1);
    },
  );

  it.each(['straight', 'shuffle', 'bossa'] as const)(
    'keeps the full %s mix below clipping with the click on',
    (feel) => {
      const recipe = createRecipe('A', 'ii-V-I', feel, 240);
      const score = createScore(studies[0], recipe);
      const file = new midi.MidiFile();
      new midi.MidiFileGenerator(score, null, new midi.AlphaSynthMidiFileHandler(file)).generate();
      naturalPlayback(file, recipe);
      const audio = renderMidi(bank, file, { click: 0.55, endTick: 15360 });
      expect(audio.every(Number.isFinite)).toBe(true);
      expect(peak(audio)).toBeGreaterThan(0.02);
      expect(peak(audio)).toBeLessThan(0.95);
      for (const settings of [
        { compression: 30, reverb: 40 },
        { compression: 0, reverb: 100 },
        { compression: 100, reverb: 100 },
      ]) {
        const fx = new PlaybackEffects(48000);
        fx.configure(settings);
        fx.reset();
        const polished = fx.process(audio);
        expect(polished.length).toBe(audio.length);
        expect(polished.every(Number.isFinite)).toBe(true);
        expect(peak(polished)).toBeLessThan(0.95);
      }
    },
  );
});
