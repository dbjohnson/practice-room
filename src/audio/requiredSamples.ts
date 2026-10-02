import { midi, type Settings } from '@coderline/alphatab';
import type { ExerciseLoopOptions } from './exerciseLoopBuffer';
import type { SampleManifest } from './soundfont/sampleTypes';
import { naturalPlayback } from './naturalPlayback';
import { exercisePlayback } from './exercisePlayback';

export function requiredSamples(
  manifest: SampleManifest,
  options: ExerciseLoopOptions,
  settings: Settings,
) {
  const file = new midi.MidiFile();
  const generator = new midi.MidiFileGenerator(
    options.score,
    settings,
    new midi.AlphaSynthMidiFileHandler(file),
  );
  // Sounding pitches include guitar/bass octave transposition, as in synthesis.
  generator.applyTranspositionPitches = true;
  generator.generate();
  naturalPlayback(file, options.recipe);
  exercisePlayback(file, options.exerciseArticulation);
  const programs = new Map<number, number>();
  const selected = new Set<number>();
  const select = (bank: number, program: number, key: number, velocity: number) => {
    const candidates = manifest.regions.filter((r) => r.bank === bank && r.program === program);
    const regions = candidates.length
      ? candidates
      : manifest.regions.filter((r) => r.bank === bank && r.program === 0);
    for (const r of regions)
      if (r.low <= key && r.high >= key && r.velocityLow <= velocity && r.velocityHigh >= velocity)
        selected.add(r.sample);
  };
  // One small woodblock also covers count-in and toggling click on during playback.
  select(128, 0, 33, 95);
  for (const event of file.events) {
    if (event instanceof midi.ProgramChangeEvent) programs.set(event.channel, event.program);
    else if (event instanceof midi.NoteOnEvent)
      select(
        event.channel === 9 ? 128 : 0,
        programs.get(event.channel) ?? 0,
        event.noteKey,
        event.noteVelocity,
      );
  }
  return [...selected].sort((a, b) => a - b);
}
