import type { AlphaTabApi } from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { loopbackLatency, playerContext, reportedOutputLatency } from '../../src/audio/latency';

const clicks = Array.from({ length: 12 }, (_, i) => 10 + i * 0.35);
describe('latency sources', () => {
  it('measures the round trip from clicks that come back together', () => {
    const jitter = [0, 2, -1, 1, -2, 0, 3, -1, 1, 0, -2, 2];
    const attacks = clicks.map((click, i) => click + 0.043 + jitter[i] / 1000);
    expect(loopbackLatency(clicks, attacks)).toBeCloseTo(0.043, 3);
    // Two clicks lost and a stray attack do not spoil it.
    expect(loopbackLatency(clicks, [9.2, ...attacks.slice(2)])).toBeCloseTo(0.043, 2);
  });
  it('refuses silence, too few clicks and inconsistent delays', () => {
    expect(loopbackLatency(clicks, [])).toBeNull();
    expect(loopbackLatency(clicks, [10.04, 10.39, 10.74, 11.09])).toBeNull();
    expect(
      loopbackLatency(
        clicks,
        clicks.map((click, i) => click + 0.02 + i * 0.03),
      ),
    ).toBeNull();
  });
  it('reads the latency the browser reports for the player output', () => {
    const context = { currentTime: 1, baseLatency: 0.005, outputLatency: 0.02 };
    const api = { player: { output: { context } } } as unknown as AlphaTabApi;
    expect(reportedOutputLatency(playerContext(api))).toBeCloseTo(0.025, 6);
    expect(reportedOutputLatency(playerContext(null))).toBe(0);
    expect(playerContext({ player: null } as unknown as AlphaTabApi)).toBeNull();
    // Safari reports no output latency.
    expect(reportedOutputLatency({ baseLatency: 0.004 } as AudioContext)).toBeCloseTo(0.004, 6);
  });
});
