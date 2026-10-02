import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandSoundFont } from '../../../src/audio/soundfont/bandSoundFont';
import { splitSamples } from '../../../src/audio/soundfont/splitSamples';
import { assembleSamples } from '../../../src/audio/soundfont/assembleSamples';
import manifest from '../../../src/audio/assets/band-manifest.json';
import { InputAnalyzer } from '../../../src/audio/inputAnalyzer';
import type { Observation } from '../../../src/domain/types';
import { renderAudio } from './renderAudio';

const original = readFileSync(
  new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab')),
);
const bank = splitSamples(
  bandSoundFont(original, manifest, (file) => readFileSync(`src/audio/assets/${file}`)),
);
const voice = (program: number, keys: number[]) => {
  const ids = [
    ...new Set(
      bank.manifest.regions
        .filter(
          (r) =>
            r.bank === 0 &&
            r.program === program &&
            keys.some((key) => r.low <= key && r.high >= key) &&
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
function listen(stereo: Float32Array) {
  const observations: Observation[] = [];
  const analyzer = new InputAnalyzer(
    48000,
    () => {},
    (observation) => observations.push(observation),
  );
  const block = new Float32Array(128);
  // A live input keeps running after the last note; add the silence that follows it.
  const frames = stereo.length / 2 + 48000 * 0.4;
  for (let i = 0; i + 128 <= frames; i += 128) {
    for (let j = 0; j < 128; j++)
      block[j] = ((stereo[(i + j) * 2] ?? 0) + (stereo[(i + j) * 2 + 1] ?? 0)) / 2;
    analyzer.push(block, i / 48000);
  }
  return observations;
}

// The same recorded guitar and bass samples that exposed false attacks in PCM analysis.
// The lines include notes that ring into each other and an octave leap on bass.
describe('live detection of recorded strings', { timeout: 30000 }, () => {
  it.each([
    [27, 40],
    [33, 29],
  ] as const)('hears one attack in a sustained program %i note', (program, key) => {
    const observations = listen(
      renderAudio(voice(program, [key]), {
        notes: [{ key, channel: 0, program, tick: 960, duration: 1920 }],
      }),
    );
    expect(observations).toHaveLength(1);
    expect(observations[0].midi).toBeCloseTo(key, 0);
    expect(Math.abs(observations[0].time - 0.5)).toBeLessThan(0.03);
  });
  it('hears eight repeated low guitar plucks at 240 BPM', () => {
    const notes = Array.from({ length: 8 }, (_, i) => ({
      key: 40,
      channel: 0,
      program: 27,
      tick: 960 + i * 480,
      duration: 360,
    }));
    const observations = listen(renderAudio(voice(27, [40]), { bpm: 240, notes }));
    expect(observations.map((o) => Math.round(o.midi ?? 0))).toEqual(Array(8).fill(40));
    observations.forEach((o, i) =>
      expect(Math.abs(o.time - (0.25 + i * 0.125))).toBeLessThan(0.03),
    );
  });
  it.each([
    [27, [52, 55, 57, 59, 57, 55, 52, 50]],
    [33, [28, 33, 35, 28, 31, 33, 28, 40]],
  ] as const)('names and times a program %i line', (program, keys) => {
    const notes = keys.map((key, i) => ({
      key,
      channel: 0,
      program,
      tick: 960 + i * 480,
      duration: 440,
    }));
    const stereo = renderAudio(voice(program, [...keys]), { notes });
    const observations = listen(stereo);
    expect(observations.map((o) => Math.round(o.midi ?? 0))).toEqual([...keys]);
    observations.forEach((o, i) => expect(Math.abs(o.time - (0.5 + i * 0.25))).toBeLessThan(0.03));
  });
});
