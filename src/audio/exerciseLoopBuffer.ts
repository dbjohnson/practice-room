import { midi, synth, type AlphaTabApi } from '@coderline/alphatab';
import type { PlayerOptions } from './useScorePlayer';
import { naturalPlayback } from './naturalPlayback';
import { exercisePlayback } from './exercisePlayback';
import { playbackRange } from '../music/scoreTimeline';
import { repeatMidiRange, midiLoopTiming } from './loopMidi';
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
> &
  Partial<Pick<PlayerOptions, 'range' | 'routed'>>;

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
  const range = options.range ? playbackRange(api, options.score, options.range) : null;
  const start = range?.startTick ?? 0;
  const end = range?.endTick ?? api.endTick;
  const speed = options.tempo / options.score.tempo;
  const bar = options.score.masterBars[(options.range?.start ?? 1) - 1];
  const timing = midiLoopTiming(
    original,
    start,
    end,
    speed,
    options.score.tempo,
    bar?.timeSignatureNumerator,
    bar?.timeSignatureDenominator,
  );
  return {
    file: repeatMidiRange(original, start, end, speed),
    duration: timing.duration,
    end: end - start,
    timing,
    transpositions: generator.transpositionPitches,
  };
}

export async function renderExerciseLoop(
  api: AlphaTabApi,
  options: ExerciseLoopOptions,
  context: AudioContext,
  signal: AbortSignal,
) {
  const { file, duration, end, timing, transpositions } = exerciseLoopMidi(api, options);
  const sampleRate = context.sampleRate;
  const frames = Math.round(duration * sampleRate);
  if (frames <= 0 || duration > 600) throw new Error('Keep a continuous loop under ten minutes.');
  const settings = new synth.AudioExportOptions();
  settings.sampleRate = sampleRate;
  settings.useSyncPoints = false;
  // A separate native source keeps the click adjustable during a recording.
  settings.metronomeVolume = 0;
  for (const track of options.score.tracks) {
    const volume =
      options.muted.includes(track.index) || options.routed?.includes(track.index)
        ? 0
        : (options.volumes[track.index] ?? 80) / 100;
    settings.trackVolume.set(track.playbackInfo.primaryChannel, volume);
    settings.trackVolume.set(track.playbackInfo.secondaryChannel, volume);
  }
  // alphaTab 1.8 exposes a player facade; its own exportAudio passes the underlying
  // instance. Passing the facade creates a new worker without the loaded SoundFont.
  const player = api.player as
    (NonNullable<AlphaTabApi['player']> & { instance?: AlphaTabApi['player'] }) | null;
  const instance = player && 'instance' in player ? player.instance : player;
  const exporter = api.uiFacade.createWorkerAudioExporter(instance ?? null);
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
    return { buffer, end, timing };
  } finally {
    exporter.destroy();
  }
}
