import { describe, expect, it } from 'vitest';
import type { AlphaTabApi } from '@coderline/alphatab';
import { waveformLayout } from '../../src/music/waveformLayout';

describe('recorded waveform placement', () => {
  it('uses beat references when worker bounds omit their bar model', () => {
    const beat = { voice: { index: 0, bar: { staff: { track: { index: 1 } }, masterBar: {} } } };
    const api = {
      tickCache: { getBeatStart: () => 960, getMasterBar: () => ({ end: 1920 }) },
      settings: { display: { scale: 1 } },
      boundsLookup: {
        staffSystems: [
          {
            bars: [
              {
                bars: [{ beats: [{ beat, onNotesX: 100 }] }],
                realBounds: { x: 80, w: 220 },
                lineAlignedBounds: { y: 20, h: 100 },
              },
            ],
          },
        ],
      },
    } as unknown as AlphaTabApi;
    expect(waveformLayout(api, [{ tick: 1440, peak: 0.25 }], 1)).toBe(
      'M200.0,57.0L201.0,57.0L201.0,83.0L200.0,83.0Z',
    );
    expect(waveformLayout(api, [{ tick: 1440, peak: 0.25 }], 0)).toBe('');
    expect(
      waveformLayout(
        api,
        [
          { tick: 960, peak: 0.25 },
          { tick: 1440, peak: 1 },
        ],
        1,
      ),
    ).toBe('M100.0,57.0L200.0,44.0L200.0,96.0L100.0,83.0Z');
    // A new system starts a separate closed shape, never a diagonal through the score.
    const first = api.boundsLookup!.staffSystems[0];
    api.boundsLookup!.staffSystems.push({
      ...first,
      bars: first.bars.map((bar) => ({
        ...bar,
        lineAlignedBounds: { ...bar.lineAlignedBounds, y: 220 },
        bars: [
          {
            ...bar.bars[0],
            beats: [{ ...bar.bars[0].beats[0], beat: { ...beat, nextRow: true } }],
          },
        ],
      })),
    } as unknown as typeof first);
    api.tickCache!.getBeatStart = (value) => ('nextRow' in value ? 1920 : 960);
    api.tickCache!.getMasterBar = () => ({ end: 2880 }) as never;
    const wrapped = waveformLayout(
      api,
      [
        { tick: 1440, peak: 0.25 },
        { tick: 2400, peak: 0.25 },
      ],
      1,
    );
    expect(wrapped.match(/M/g)).toHaveLength(2);
    expect(wrapped.match(/Z/g)).toHaveLength(2);
  });
});
