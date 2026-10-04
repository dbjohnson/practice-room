// @vitest-environment jsdom
import type { AlphaTabApi } from '@coderline/alphatab';
import { afterEach, expect, it, vi } from 'vitest';
import { UniformScoreCursor, uniformCursorPosition } from '../../src/audio/UniformScoreCursor';

const spans = [
  { start: 0, end: 3840, left: 100, right: 500, top: 30, height: 120 },
  { start: 3840, end: 7680, left: 80, right: 480, top: 230, height: 120 },
  { start: 7680, end: 11520, left: 100, right: 500, top: 30, height: 120 },
];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('moves equal distances for equal ticks, including swung offbeats, and handles line changes and repeats', () => {
  expect([0, 480, 960, 1440].map((tick) => uniformCursorPosition(spans, tick)?.x)).toEqual([
    100, 150, 200, 250,
  ]);
  expect(uniformCursorPosition(spans, 640)?.x).toBeCloseTo(166.6667);
  expect(uniformCursorPosition(spans, 3840)).toEqual({ x: 80, y: 230, height: 120 });
  expect(uniformCursorPosition(spans, 7680)).toEqual({ x: 100, y: 30, height: 120 });
  expect(uniformCursorPosition(spans, -1)).toBeNull();
});

it('animates between synth reports independently of beat spacing, freezes on seek, and cleans up', () => {
  let now = 0;
  let frame!: FrameRequestCallback;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      frame = callback;
      return 1;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const host = document.createElement('div');
  const api = {
    tickPosition: 640,
    tickCache: { masterBars: [{ start: 0, end: 3840, masterBar: { index: 0 } }] },
    boundsLookup: {
      staffSystems: [
        {
          bars: [
            {
              index: 0,
              realBounds: { x: 80, w: 420 },
              visualBounds: { y: 30, h: 120 },
              bars: [{ beats: [{ onNotesX: 100 }, { onNotesX: 400 }] }],
            },
          ],
        },
      ],
    },
  } as unknown as AlphaTabApi;
  const cursor = new UniformScoreCursor(api, host);
  cursor.position(0, 120, true);
  const line = host.querySelector<HTMLElement>('.uniform-score-cursor')!;
  expect(line.style.transform).toBe('translate(100px, 30px)');
  now = 250;
  frame(now);
  expect(line.style.transform).toBe('translate(150px, 30px)');
  cursor.position(640, 120, false);
  expect(line.style.transform).toContain('166.666');
  now = 500;
  cursor.redraw();
  expect(line.style.transform).toContain('166.666');
  cursor.dispose();
  expect(host.querySelector('.uniform-score-cursor')).toBeNull();
  expect(host.classList.contains('uniform-cursor-enabled')).toBe(false);
});
