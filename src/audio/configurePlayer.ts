import type { AlphaTabApi } from '@coderline/alphatab';
import type { PlayerOptions } from './useScorePlayer';
import { playbackRange } from '../music/scoreTimeline';

export function configurePlayer(api: AlphaTabApi, options: PlayerOptions, forceRange = false) {
  api.playbackSpeed = options.tempo / options.score.tempo;
  api.isLooping = options.loop && options.mode !== 'assess' && !options.replaying;
  api.metronomeVolume = options.click ? 0.55 : 0;
  api.countInVolume = options.countIn && !options.replaying ? 0.6 : 0;
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
        (options.replaying && !options.replayBacking) ||
        (options.mode !== 'listen' && options.track === track.index),
    );
    api.changeTrackVolume([track], (options.volumes[track.index] ?? 80) / 100);
  }
}
