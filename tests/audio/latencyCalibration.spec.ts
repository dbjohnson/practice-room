import { describe, expect, it } from 'vitest';
import {
  calibrationPattern,
  detectTransients,
  estimateLatency,
} from '../../src/audio/latencyCalibration';

describe('input latency calibration', () => {
  it.each([0.075, -0.045, 0.24])(
    'aligns a steady 32-note performance offset by %s seconds',
    (offset) => {
      const result = estimateLatency(
        calibrationPattern.map((time, i) => time + offset + ((i % 3) - 1) * 0.004),
      );
      expect(result.reliable).toBe(true);
      expect(result.offsetMs).toBeCloseTo(offset * 1000, 0);
      expect(result.matched).toBe(32);
      expect(result.jitterMs).toBeLessThan(10);
    },
  );
  it('keeps later hits aligned despite interior misses and stray attacks', () => {
    const heard = calibrationPattern
      .filter((_, i) => ![7, 12, 20].includes(i))
      .map((time) => time + 0.065);
    const result = estimateLatency([...heard, 2.03, 4.03, 7.03]);
    expect(result.reliable).toBe(true);
    expect(result.offsetMs).toBe(65);
    expect(result.matched).toBe(29);
  });
  it('rejects silence, clipping, an ambiguous opening and drifting playing', () => {
    expect(estimateLatency([]).reliable).toBe(false);
    expect(estimateLatency(calibrationPattern, true).reliable).toBe(false);
    expect(estimateLatency(calibrationPattern.slice(1).map((time) => time + 0.04)).reliable).toBe(
      false,
    );
    expect(estimateLatency(calibrationPattern.map((time, i) => time + 0.0035 * i)).reliable).toBe(
      false,
    );
  });
  it('detects raw attacks without pitch recognition and ignores their ringing tails', () => {
    const rate = 48000;
    const audio = new Float32Array(12 * rate);
    for (const time of calibrationPattern) {
      const at = Math.round((time + 0.08) * rate);
      for (let i = 0; i < rate * 0.22; i++)
        audio[at + i] += 0.35 * Math.exp(-i / (rate * 0.04)) * Math.sin(i * 0.09);
    }
    const hits = detectTransients(audio, rate);
    expect(hits).toHaveLength(32);
    const result = estimateLatency(hits);
    expect(result.reliable).toBe(true);
    expect(result.offsetMs).toBeGreaterThanOrEqual(78);
    expect(result.offsetMs).toBeLessThanOrEqual(82);
    expect(detectTransients(new Float32Array(rate), rate)).toEqual([]);
  });
});
