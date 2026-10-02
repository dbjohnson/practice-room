import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        'src/time/**/*.ts',
        'src/music/jam.ts',
        'src/audio/assessment.ts',
        'src/audio/midiInput.ts',
        'src/audio/midiOut.ts',
        'src/audio/pitch.ts',
        'src/audio/inputAnalyzer.ts',
        'src/domain/milestones.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: { 'src/time/**': { statements: 90, branches: 90, functions: 90, lines: 90 } },
    },
  },
});
