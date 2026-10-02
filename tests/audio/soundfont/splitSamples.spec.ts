import { readFileSync } from 'node:fs';
import { Settings } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { splitSamples } from '../../../src/audio/soundfont/splitSamples';
import { assembleSamples } from '../../../src/audio/soundfont/assembleSamples';
import { requiredSamples } from '../../../src/audio/requiredSamples';
import { woodblockSoundFont } from '../../../src/audio/soundfont/woodblockSoundFont';
import { bandSoundFont } from '../../../src/audio/soundfont/bandSoundFont';
import manifest from '../../../src/audio/assets/band-manifest.json';
import { renderAudio } from './renderAudio';
import { createScore } from '../../../src/music/createScore';
import { studies } from '../../../src/music/catalog';
import { createExerciseScore } from '../../../src/music/exerciseScore';
import { starterExercises } from '../../../src/music/exerciseCatalog';
import { exerciseSet } from '../../../src/domain/gymPlan';

const base = woodblockSoundFont(
  readFileSync(new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab'))),
  readFileSync('src/audio/assets/woody-block.wav'),
);
const bank = bandSoundFont(base, manifest, (file) => readFileSync(`src/audio/assets/${file}`));
const split = splitSamples(bank);
const options = (score: ReturnType<typeof createScore>) => ({
  score,
  tempo: 120,
  click: true,
  track: 0,
  mode: 'listen' as const,
  muted: [],
  volumes: {},
  effects: { compression: 0, reverb: 0 },
});

describe('note-level sound assets', { timeout: 60000 }, () => {
  it.each([
    ['guitar', 64, 0, 27, 0],
    ['bass', 40, 2, 33, 0],
    ['piano', 60, 4, 0, 0],
    ['kick', 36, 9, 0, 128],
    ['woodblock', 33, 9, 0, 128],
    ['fallback', 60, 4, 4, 0],
  ] as const)(
    'preserves the %s voice with only its matching samples',
    (_, key, channel, program, bankId) => {
      const ids = new Set(
        split.manifest.regions
          .filter(
            (r) =>
              r.bank === bankId &&
              r.program === program &&
              r.low <= key &&
              r.high >= key &&
              r.velocityLow <= 95 &&
              r.velocityHigh >= 95,
          )
          .map((r) => r.sample),
      );
      const data = new Map(
        [...ids].map((id) => [id, { ...split.manifest.samples[id], bytes: split.files[id] }]),
      );
      const selected = assembleSamples(split.template, data);
      const phrase = { notes: [{ key, channel, program }] };
      const original = renderAudio(bank, phrase),
        actual = renderAudio(selected, phrase);
      expect(actual.some((sample) => sample !== 0)).toBe(true);
      expect(Buffer.from(actual.buffer)).toEqual(Buffer.from(original.buffer));
      expect(selected.length).toBeLessThan(bank.length / 10);
    },
  );
  it('loads only the active exercise notes and velocity layers, plus the small click', () => {
    const score = createExerciseScore(starterExercises[0], exerciseSet(starterExercises[0])).score;
    const ids = requiredSamples(split.manifest, options(score), new Settings());
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.length).toBeLessThan(30);
    const bytes = ids.reduce((size, id) => size + split.files[id].length, split.template.length);
    expect(bytes).toBeLessThan(bank.length / 10);
    expect(
      split.manifest.regions.some((r) => r.bank === 128 && r.low === 33 && ids.includes(r.sample)),
    ).toBe(true);
  });
  it('keeps the Evening study download below the full bank and includes authored drum variants', () => {
    const piece = studies.find((p) => p.id === 'evening-study')!;
    const score = createScore(piece, piece.recipe!);
    const ids = requiredSamples(
      split.manifest,
      { ...options(score), recipe: piece.recipe },
      new Settings(),
    );
    const bytes = ids.reduce((size, id) => size + split.files[id].length, split.template.length);
    expect(bytes).toBeLessThan(bank.length / 2);
    const covered = split.manifest.regions.filter((r) => r.bank === 128 && ids.includes(r.sample));
    expect(covered.some((r) => r.low === 36)).toBe(true);
    expect(covered.some((r) => r.low === 90)).toBe(true);
  });
});
