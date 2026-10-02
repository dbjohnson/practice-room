import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRiff, requireChunk } from '../../../src/audio/soundfont/riff';
import { woodblockSoundFont } from '../../../src/audio/soundfont/woodblockSoundFont';
import { renderAudio } from './renderAudio';

const original = readFileSync(
  new URL('./soundfont/sonivox.sf2', import.meta.resolve('@coderline/alphatab')),
);
const wav = readFileSync('src/audio/assets/woody-block.wav');
const updated = woodblockSoundFont(original, wav);

describe('woodblock metronome sound bank', () => {
  it('renders the selected recording through the real metronome voice', () => {
    const samples = renderAudio(updated, { click: 0.55 });
    const pcm = requireChunk(readRiff(wav, 'WAVE'), 'data').data;
    const source = Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2) / 32768);
    let correlation = 0;
    for (let offset = 0; offset < 128; offset++) {
      let dot = 0;
      let sourceEnergy = 0;
      let outputEnergy = 0;
      for (let i = 0; i < source.length; i++) {
        const output = samples[(i + offset) * 2];
        dot += source[i] * output;
        sourceEnergy += source[i] ** 2;
        outputEnergy += output ** 2;
      }
      correlation = Math.max(correlation, dot / Math.sqrt(sourceEnergy * outputEnergy));
    }
    expect(correlation).toBeGreaterThan(0.99);
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(Math.max(...samples.subarray(0, 48000))).toBeLessThan(1);
    const oldClick = renderAudio(original, { click: 0.55 });
    expect(Buffer.from(samples.buffer).equals(Buffer.from(oldClick.buffer))).toBe(false);
  });

  it.each([30, 120, 240])('plays four short hits at %i BPM and is silent when disabled', (bpm) => {
    const samples = renderAudio(updated, { bpm, click: 0.55 });
    const interval = Math.round((60 / bpm) * 48000);
    for (let beat = 0; beat < 4; beat++) {
      const start = beat * interval;
      const hit = samples.subarray(start * 2, (start + 9600) * 2);
      expect(hit.some((sample) => Math.abs(sample) > 0.01)).toBe(true);
      const gap = samples.subarray((start + 9600) * 2, (start + interval - 128) * 2);
      expect(gap.every((sample) => sample === 0)).toBe(true);
    }
    expect(renderAudio(updated, { bpm, click: 0 }).every((sample) => sample === 0)).toBe(true);
  });

  it.each([
    ['kick', 36, 9, 0],
    ['snare', 38, 9, 0],
    ['hi-hat', 42, 9, 0],
    ['metronome bell', 34, 9, 0],
    ['guitar', 64, 0, 27],
    ['bass', 40, 2, 33],
    ['keys', 60, 4, 4],
  ] as const)('preserves the %s audio exactly', (_, key, channel, program) => {
    const options = { notes: [{ key, channel, program }] };
    const before = renderAudio(original, options);
    const after = renderAudio(updated, options);
    expect(after.some((sample) => sample !== 0)).toBe(true);
    expect(Buffer.from(after.buffer).equals(Buffer.from(before.buffer))).toBe(true);
  });

  it('rejects damaged input and unsupported WAV formats', () => {
    expect(() => woodblockSoundFont(original.subarray(0, 100), wav)).toThrow('RIFF');
    const stereo = Buffer.from(wav);
    requireChunk(readRiff(stereo, 'WAVE'), 'fmt ').data.writeUInt16LE(2, 2);
    expect(() => woodblockSoundFont(original, stereo)).toThrow('mono 16-bit PCM');
  });
});
