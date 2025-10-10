export const PRESETS: Record<string, { name: string; patterns: boolean[][] }> = {
  'four-on-the-floor': {
    name: 'Four on the Floor',
    patterns: [
      [true, true, true, true], // Kick
      [false, false, false, false, false, false, false, false], // Snare
      [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false], // Hi-hat
    ],
  },
  'basic-rock': {
    name: 'Basic Rock Beat',
    patterns: [
      [true, false, true, false], // Kick
      [false, false, true, false, false, false, true, false], // Snare
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true], // Hi-hat
    ],
  },
  'single-stroke': {
    name: 'Single Stroke Roll',
    patterns: [
      [false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    ],
  },
  paradiddle: {
    name: 'Paradiddle',
    patterns: [
      [false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [true, true, true, false, true, true, false, true, true, true, true, false, true, true, false, true],
    ],
  },
  'double-stroke': {
    name: 'Double Stroke Roll',
    patterns: [
      [false, false, false, false],
      [false, false, false, false, false, false, false, false],
      [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
    ],
  },
};
