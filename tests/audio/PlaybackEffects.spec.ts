import { describe, expect, it } from 'vitest';
import { DEFAULT_MIX_EFFECTS, PlaybackEffects } from '../../src/audio/PlaybackEffects';
import { attachPlaybackEffects } from '../../src/audio/attachPlaybackEffects';
import type { synth } from '@coderline/alphatab';

const rate = 48000;
const energy = (x: Float32Array) => x.reduce((sum, value) => sum + value * value, 0);

describe('adjustable mix effects', () => {
  it('bypasses exactly and preserves the stereo balance under compression', () => {
    const input = Float32Array.from({ length: rate * 2 }, (_, i) => (i % 2 ? 0.2 : 0.6));
    const fx = new PlaybackEffects(rate);
    fx.configure({ compression: 0, reverb: 0 });
    expect(fx.process(input)).toBe(input);
    fx.configure({ compression: 30, reverb: 0 });
    const output = fx.process(input);
    expect(output.length).toBe(input.length);
    expect(output[0]).toBeCloseTo(input[0], 6); // No lookahead or delayed attack.
    expect(output.at(-2)!).toBeLessThan(0.3);
    expect(output.at(-2)! / output.at(-1)!).toBeCloseTo(3, 5);
    expect(input[0]).toBeCloseTo(0.6);
    expect(output.every(Number.isFinite)).toBe(true);
  });

  it('progressively compresses the same performance from subtle to heavy', () => {
    const input = new Float32Array(rate * 2).fill(0.2);
    const settled = [0, 30, 100].map((compression) => {
      const fx = new PlaybackEffects(rate);
      fx.configure({ compression, reverb: 0 });
      fx.reset();
      return fx.process(input).at(-1)!;
    });
    expect(settled[1]).toBeLessThan(settled[0] * 0.5);
    expect(settled[2]).toBeLessThan(settled[1] * 0.25);
  });

  it.each([44100, 48000])(
    'extends a clearly audible room into a much wetter, longer tail at %i Hz',
    (sampleRate) => {
      const impulse = new Float32Array(sampleRate * 2 * 5);
      impulse[0] = impulse[1] = 0.5;
      const renders = [10, 40, 100].map((reverb) => {
        const fx = new PlaybackEffects(sampleRate);
        fx.configure({ compression: 0, reverb });
        fx.reset();
        const output = fx.process(impulse);
        expect(output[0]).toBeGreaterThan(0); // Immediate dry attack, even at maximum.
        expect(output.every(Number.isFinite)).toBe(true);
        fx.reset();
        expect(fx.process(new Float32Array(sampleRate)).every((value) => value === 0)).toBe(true);
        return output;
      });
      const early = renders.map((output) =>
        energy(
          output.subarray(Math.round(sampleRate * 0.02) * 2, Math.round(sampleRate * 0.2) * 2),
        ),
      );
      expect(early[1]).toBeGreaterThan(early[0] * 5);
      expect(early[2]).toBeGreaterThan(early[1] * 3);
      const late = renders.map((output) => energy(output.subarray(sampleRate * 3, sampleRate * 6)));
      expect(late[2]).toBeGreaterThan(0.00001);
      expect(late[2]).toBeGreaterThan(late[1] * 1000);
      expect(energy(renders[2].subarray(sampleRate * 8))).toBeLessThan(late[2] * 0.01);
    },
    15000, // Render long decays at both sample rates, including coverage instrumentation.
  );

  it('preserves the tail and glides when either amount changes during playback', () => {
    const input = Float32Array.from({ length: rate * 2 }, (_, i) => 0.2 * Math.sin(i * 0.05));
    const fx = new PlaybackEffects(rate);
    const unchanged = new PlaybackEffects(rate);
    fx.process(input);
    unchanged.process(input);
    fx.configure({ compression: 80, reverb: 100 });
    const tail = fx.process(new Float32Array(512));
    const reference = unchanged.process(new Float32Array(512));
    expect(energy(tail)).toBeGreaterThan(0.00001);
    expect(Math.abs(tail[0] - reference[0])).toBeLessThan(0.0001);
    // Bypassing compression alone must also leave the room tail intact.
    fx.configure({ compression: 0, reverb: 100 });
    expect(energy(fx.process(new Float32Array(512)))).toBeGreaterThan(0.00001);
  });

  it('bounds out-of-range amounts and safely bypasses nonfinite values', () => {
    const input = new Float32Array(4096).fill(0.2);
    const bounded = new PlaybackEffects(rate);
    const maximum = new PlaybackEffects(rate);
    bounded.configure({ compression: 120, reverb: 200 });
    maximum.configure({ compression: 100, reverb: 100 });
    expect(
      Buffer.from(bounded.process(input).buffer).equals(Buffer.from(maximum.process(input).buffer)),
    ).toBe(true);
    bounded.configure({ compression: -1, reverb: NaN });
    expect(bounded.process(input)).toBe(input);
  });

  it('produces identical audio across buffer boundaries and clears tails when bypassed', () => {
    const input = Float32Array.from({ length: rate * 2 }, (_, i) => 0.2 * Math.sin(i * 0.05));
    const whole = new PlaybackEffects(rate).process(input);
    const streamed = new PlaybackEffects(rate);
    const chunks = new Float32Array(input.length);
    for (let offset = 0; offset < input.length; offset += 512)
      chunks.set(streamed.process(input.subarray(offset, offset + 512)), offset);
    expect(Buffer.from(chunks.buffer).equals(Buffer.from(whole.buffer))).toBe(true);
    streamed.configure({ compression: 0, reverb: 0 });
    streamed.configure({ ...DEFAULT_MIX_EFFECTS });
    expect(streamed.process(new Float32Array(4096)).every((value) => value === 0)).toBe(true);
  });

  it('keeps the synth clock and restores output methods when detached', () => {
    let captured: Float32Array = new Float32Array();
    const addSamples = (samples: Float32Array) => {
      captured = samples;
    };
    const output = {
      sampleRate: rate,
      addSamples,
      resetSamples() {},
      pause() {},
    } as unknown as synth.ISynthOutput;
    const fx = attachPlaybackEffects(output);
    const samples = new Float32Array(4096).fill(0.5);
    output.addSamples(samples);
    expect(captured.length).toBe(samples.length);
    expect(energy(captured)).toBeLessThan(energy(samples));
    output.resetSamples();
    output.addSamples(new Float32Array(4096));
    expect(captured.every((value) => value === 0)).toBe(true);
    fx.dispose();
    expect(output.addSamples).toBe(addSamples);
  });
});
