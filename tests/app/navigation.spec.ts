import { describe, expect, it } from 'vitest';
import { navigationHash, readNavigation } from '../../src/app/navigation';

describe('navigation fragments', () => {
  it('round-trips selected music and views with URL-safe IDs', () => {
    const state = {
      song: 'saved / song & #1',
      section: 'practice',
      part: 2,
      view: 'tab',
      zoom: 150,
      transpose: -3,
    } as const;
    expect(readNavigation(navigationHash(state))).toEqual(state);
  });
  it('validates unknown pages, views and track numbers', () => {
    expect(readNavigation('#section=bad&concept=bad&view=bad&part=-1')).toEqual({
      song: 'evening-study',
      section: 'practice',
      part: 0,
      view: 'both',
      zoom: 100,
      transpose: 0,
    });
    expect(readNavigation('#part=Infinity').part).toBe(0);
    expect(readNavigation('#part=1.5').part).toBe(0);
  });
  it('bounds transposition and rejects invalid values', () => {
    expect(readNavigation('#transpose=-99').transpose).toBe(-12);
    expect(readNavigation('#transpose=99').transpose).toBe(12);
    for (const value of ['bad', 'Infinity', '1.5'])
      expect(readNavigation(`#transpose=${value}`).transpose).toBe(0);
  });
  it('bounds zoom and recovers invalid or missing values', () => {
    expect(readNavigation('').zoom).toBe(100);
    expect(readNavigation('#zoom=').zoom).toBe(100);
    expect(readNavigation('#zoom=25').zoom).toBe(50);
    expect(readNavigation('#zoom=300').zoom).toBe(200);
    for (const value of ['NaN', 'Infinity', 'invalid', '99.5']) {
      expect(readNavigation(`#zoom=${value}`).zoom).toBe(100);
    }
  });
});

it('round-trips the gym page and its selected section', () => {
  const state = { ...readNavigation(''), section: 'gym' as const, gym: 'routines' as const };
  expect(readNavigation(navigationHash(state))).toEqual(state);
  expect(readNavigation('#section=gym&gym=unknown')).toMatchObject({
    section: 'gym',
    gym: 'exercises',
  });
});
