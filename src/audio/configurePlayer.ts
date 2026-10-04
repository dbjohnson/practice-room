import type { AlphaTabApi } from '@coderline/alphatab';
import type { PlayerOptions } from './useScorePlayer';
import { playbackRange } from '../music/scoreTimeline';

export function configurePlayer(api: AlphaTabApi, options: PlayerOptions, forceRange = false) {
  api.playbackSpeed = options.tempo / options.score.tempo;
  api.isLooping = options.loop && options.mode !== 'assess' && !options.replaying;
  api.metronomeVolume = options.click ? (options.clickVolume ?? 55) / 100 : 0;
  // alphaTab uses a positive volume to enable count-in timing. Keep a silent
  // count-in for visual-only practice instead of skipping its beats entirely.
  api.countInVolume =
    options.countIn && !options.replaying
      ? Math.max(Number.EPSILON, options.click ? (options.clickVolume ?? 55) / 100 : 0)
      : 0;
  const range = playbackRange(api, options.score, options.range);
  if (
    range &&
    (forceRange ||
      api.playbackRange?.startTick !== range.startTick ||
      api.playbackRange?.endTick !== range.endTick)
  )
    api.playbackRange = range;
  for (const track of options.score.tracks) {
    api.changeTrackMute(
      [track],
      options.muted.includes(track.index) ||
        options.routed?.includes(track.index) ||
        (options.replaying && !options.replayBacking),
    );
    api.changeTrackVolume([track], (options.volumes[track.index] ?? 80) / 100);
  }
}
