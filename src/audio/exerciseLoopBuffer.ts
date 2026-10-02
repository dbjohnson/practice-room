import { midi, synth, type AlphaTabApi } from '@coderline/alphatab';
import type { PlayerOptions } from './useScorePlayer';
import { naturalPlayback } from './naturalPlayback';
import { exercisePlayback } from './exercisePlayback';
import { PlaybackEffects } from './PlaybackEffects';
export type ExerciseLoopOptions = Pick<
  PlayerOptions,
  | 'score'
  | 'recipe'
  | 'exerciseArticulation'
  | 'tempo'
  | 'click'
  | 'track'
  | 'mode'
  | 'muted'
  | 'volumes'
  | 'effects'
>;

/** Two cycles let held notes and room tails cross the wrap before caching a cycle. */
export function exerciseLoopMidi(api: AlphaTabApi, options: ExerciseLoopOptions) {
  const original = new midi.MidiFile();
  const generator = new midi.MidiFileGenerator(
    options.score,
    api.settings,
    new midi.AlphaSynthMidiFileHandler(original),
  );
  generator.applyTranspositionPitches = false;
  generator.generate();
  naturalPlayback(original, options.recipe);
  exercisePlayback(original, options.exerciseArticulation);
  const end = api.endTick;
  const file = new midi.MidiFile();
  file.division = original.division;
  for (let pass = 0; pass < 2; pass++)
    for (const event of original.events) {
      if (event instanceof midi.EndOfTrackEvent || event.tick > end) continue;
      const copy = Object.assign(
        Object.create(Object.getPrototypeOf(event)),
        event,
      ) as midi.MidiEvent;
      copy.tick += pass * end;
      if (copy instanceof midi.TempoChangeEvent)
        copy.beatsPerMinute *= options.tempo / options.score.tempo;
      file.addEvent(copy);
    }
  for (let track = 0; track < original.tracks.length; track++)
    file.addEvent(new midi.EndOfTrackEvent(track, end * 2));
  return {
    file,
    duration: ((end / original.division) * 60) / options.tempo,
    end,
    transpositions: generator.transpositionPitches,
  };
}

export async function renderExerciseLoop(
  api: AlphaTabApi,
  options: ExerciseLoopOptions,
  context: AudioContext,
  signal: AbortSignal,
) {
  const { file, duration, end, transpositions } = exerciseLoopMidi(api, options);
  const sampleRate = context.sampleRate;
  const frames = Math.round(duration * sampleRate);
  if (frames <= 0 || duration > 600)
    throw new Error('Keep a continuous exercise loop under ten minutes.');
  const settings = new synth.AudioExportOptions();
  settings.sampleRate = sampleRate;
  settings.useSyncPoints = false;
  // A separate native source keeps the click adjustable during a recording.
  settings.metronomeVolume = 0;
  for (const track of options.score.tracks) {
    const volume =
      options.muted.includes(track.index) ||
      (options.mode !== 'listen' && options.track === track.index)
        ? 0
        : (options.volumes[track.index] ?? 80) / 100;
    settings.trackVolume.set(track.playbackInfo.primaryChannel, volume);
    settings.trackVolume.set(track.playbackInfo.secondaryChannel, volume);
  }
  const exporter = api.uiFacade.createWorkerAudioExporter(api.player);
  try {
    await exporter.initialize(settings, file, [], transpositions);
    signal.throwIfAborted();
    const pcm = new Float32Array(frames * 4);
    let offset = 0;
    while (offset < pcm.length) {
      const chunk = await exporter.render(250);
      signal.throwIfAborted();
      if (!chunk) break;
      const count = Math.min(chunk.samples.length, pcm.length - offset);
      pcm.set(chunk.samples.subarray(0, count), offset);
      offset += count;
    }
    if (offset < frames * 4 - 2048)
      throw new Error('The exercise audio could not finish rendering.');
    const effects = new PlaybackEffects(sampleRate);
    effects.configure(options.effects);
    const processed = effects.process(pcm);
    const buffer = context.createBuffer(2, frames, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const output = buffer.getChannelData(channel);
      for (let frame = 0; frame < frames; frame++)
        output[frame] = processed[(frames + frame) * 2 + channel];
    }
    return { buffer, end };
  } finally {
    exporter.destroy();
  }
}
