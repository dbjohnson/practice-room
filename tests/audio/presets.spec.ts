import { describe, expect, test } from 'vitest';

import { PRESETS } from '../../src/presets';

describe('PRESETS', () => {
  test('exports the expected preset keys', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(['basic-rock', 'four-on-the-floor']);
  });

  test('each preset exposes a name and a 3-row boolean grid', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(typeof preset.name).toBe('string');
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.patterns).toHaveLength(3);
      for (const row of preset.patterns) {
        expect(row).toHaveLength(16);
        for (const cell of row) {
          expect(typeof cell).toBe('boolean');
        }
      }
    }
  });

  test('four-on-the-floor has a kick on every quarter note', () => {
    const kick = PRESETS['four-on-the-floor'].patterns[0];
    // 'x___x___x___x___' -> hits at indices 0, 4, 8, 12
    expect(kick[0]).toBe(true);
    expect(kick[4]).toBe(true);
    expect(kick[8]).toBe(true);
    expect(kick[12]).toBe(true);
    expect(kick[1]).toBe(false);
    expect(kick[15]).toBe(false);
  });

  test('four-on-the-floor leaves snare and hihat rows empty', () => {
    const [, snare, hihat] = PRESETS['four-on-the-floor'].patterns;
    expect(snare.every((cell) => cell === false)).toBe(true);
    expect(hihat.every((cell) => cell === false)).toBe(true);
  });

  test('basic-rock has continuous hihat and alternating kick/snare', () => {
    const [kick, snare, hihat] = PRESETS['basic-rock'].patterns;
    expect(kick[0]).toBe(true);
    expect(kick[8]).toBe(true);
    expect(snare[4]).toBe(true);
    expect(snare[12]).toBe(true);
    expect(hihat.every((cell) => cell === true)).toBe(true);
  });
});
