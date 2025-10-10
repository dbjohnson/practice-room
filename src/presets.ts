type PresetDefinition = {
  name: string;
  rows: [string, string, string];
};

const ROW_LENGTHS = [16, 16, 16] as const;

const PRESET_DEFINITIONS: Record<string, PresetDefinition> = {
  'four-on-the-floor': {
    name: 'Four on the Floor',
    rows: [
      'x___x___x___x___',
      '________________',
      '________________',
    ],
  },
  'basic-rock': {
    name: 'Basic Rock Beat',
    rows: [
      'x_______x_______',
      '____x_______x___',
      'xxxxxxxxxxxxxxxx',
    ],
  },
};

const sanitizePattern = (pattern: string): string =>
  pattern.replace(/[^A-Za-z0-9_-]/g, '');

const isHitCharacter = (char: string): boolean => char !== '_' && char !== '-';

const toBooleanPattern = (pattern: string, expectedLength: number): boolean[] => {
  const sanitized = sanitizePattern(pattern);
  if (sanitized.length === 0) {
    return Array(expectedLength).fill(false);
  }
  if (sanitized.length === expectedLength) {
    return Array.from(sanitized, isHitCharacter);
  }
  if (expectedLength % sanitized.length === 0) {
    const repeated = sanitized.repeat(expectedLength / sanitized.length);
    return Array.from(repeated, isHitCharacter);
  }
  throw new Error(
    `Preset pattern length mismatch for "${pattern}" (expected ${expectedLength}, got ${sanitized.length}).`,
  );
};

const buildPatterns = (definition: PresetDefinition): boolean[][] =>
  ROW_LENGTHS.map((length, index) =>
    toBooleanPattern(definition.rows[index] ?? '', length),
  );

export const PRESETS = Object.fromEntries(
  Object.entries(PRESET_DEFINITIONS).map(([key, definition]) => [
    key,
    {
      name: definition.name,
      patterns: buildPatterns(definition),
    },
  ]),
) as Record<string, { name: string; patterns: boolean[][] }>;
