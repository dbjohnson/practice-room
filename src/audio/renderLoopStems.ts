import type { AlphaTabApi } from '@coderline/alphatab';
import { renderExerciseLoop, type ExerciseLoopOptions } from './exerciseLoopBuffer';
import type { LoopStem } from './TrackLoopSources';

/** Keep every part, even muted ones, ready for live mute/solo and fader changes. */
export async function renderLoopStems(
  api: AlphaTabApi,
  options: ExerciseLoopOptions,
  context: AudioContext,
  signal: AbortSignal,
) {
  const stems: LoopStem[] = [];
  let result: Awaited<ReturnType<typeof renderExerciseLoop>> | undefined;
  for (const track of options.score.tracks) {
    signal.throwIfAborted();
    result = await renderExerciseLoop(
      api,
      {
        ...options,
        muted: options.score.tracks
          .filter((other) => other.index !== track.index)
          .map((other) => other.index),
        routed: [],
        volumes: { [track.index]: 100 },
      },
      context,
      signal,
    );
    stems.push({ track: track.index, buffer: result.buffer });
  }
  if (!result) throw new Error('This score has no playable tracks.');
  return { ...result, stems };
}
