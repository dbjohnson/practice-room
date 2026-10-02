import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandSoundFont } from '../../../src/audio/soundfont/bandSoundFont';
import { splitSamples } from '../../../src/audio/soundfont/splitSamples';
import { assembleSamples } from '../../../src/audio/soundfont/assembleSamples';
import manifest from '../../../src/audio/assets/band-manifest.json';
import { recordedObservations } from '../../../src/audio/recordedAssessment';
import { assess, summarize } from '../../../src/audio/assessment';
import { renderAudio } from './renderAudio';

const original = readFileSync(
  new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab')),
);
const bank = splitSamples(
  bandSoundFont(original, manifest, (file) => readFileSync(`src/audio/assets/${file}`)),
);
const voice = (program: number, key: number) => {
  const ids = [
    ...new Set(
      bank.manifest.regions
        .filter(
          (r) =>
            r.bank === 0 &&
            r.program === program &&
            r.low <= key &&
            r.high >= key &&
            r.velocityLow <= 95 &&
            r.velocityHigh >= 95,
        )
        .map((r) => r.sample),
    ),
  ];
  return assembleSamples(
    bank.template,
    new Map(ids.map((id) => [id, { ...bank.manifest.samples[id], bytes: bank.files[id] }])),
  );
};
const mono = (samples: Float32Array) =>
  Float32Array.from(
    { length: samples.length / 2 },
    (_, i) => (samples[i * 2] + samples[i * 2 + 1]) / 2,
  );
const target = (tick: number, midi: number) => ({
  tick,
  midi,
  bar: 1,
  beatId: tick,
  eligible: true,
});

describe('recorded string attack regression', { timeout: 30000 }, () => {
  it.each([
    [27, 40],
    [33, 29],
  ] as const)(
    'does not turn a sustained program %i note into dozens of attacks',
    (program, key) => {
      const audio = mono(
        renderAudio(voice(program, key), {
          notes: [{ key, channel: 0, program, tick: 960, duration: 1920 }],
        }),
      );
      const observations = recordedObservations(audio, 48000);
      expect(observations).toHaveLength(1);
      expect(observations[0].midi).toBeCloseTo(key, 0);
      expect(Math.abs(observations[0].time - 0.5)).toBeLessThan(0.03);
      expect(
        summarize(assess([target(960, key)], observations, 120, 0)).timingScore,
      ).toBeGreaterThanOrEqual(95);
      // Ringing through later written notes must not count as playing those notes.
      expect(
        summarize(
          assess([target(960, key), target(1440, key), target(1920, key)], observations, 120, 0),
        ).timingScore,
      ).toBe(33);
    },
  );
  it('preserves actual repeated low guitar plucks at 240 BPM', () => {
    const notes = Array.from({ length: 8 }, (_, i) => ({
      key: 40,
      channel: 0,
      program: 27,
      tick: 960 + i * 480,
      duration: 360,
    }));
    const audio = mono(renderAudio(voice(27, 40), { bpm: 240, notes }));
    const observations = recordedObservations(audio, 48000);
    expect(observations).toHaveLength(8);
    expect(
      summarize(
        assess(
          notes.map((n) => target(n.tick, 40)),
          observations,
          240,
          0,
        ),
      ),
    ).toMatchObject({ pitchAccuracy: 100, timingScore: 100, coverage: 100, timingCoverage: 100 });
  });
});
