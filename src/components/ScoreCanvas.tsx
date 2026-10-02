import { LoaderCircle } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { useScorePlayer } from '../audio/useScorePlayer';
import { TakeWaveform } from './TakeWaveform';

export function ScoreCanvas() {
  const r = useRoom();
  const host = useScorePlayer({
    score: r.library.score,
    exerciseArticulation: r.library.piece.gymSet?.articulation,
    recipe: r.library.piece.source === 'import' ? undefined : r.library.piece.recipe,
    track: r.track,
    tempo: r.tempo,
    range: r.range,
    loop: r.loop,
    view: r.view,
    zoom: r.zoom,
    mode: r.mode,
    click: r.click,
    countIn: r.countIn,
    muted: r.muted,
    routed: r.midiOut.routed,
    onMidi: r.midiOut.onMidi,
    volumes: r.volumes,
    effects: r.mixEffects,
    swing: r.swing,
    replaying: r.takePlayback.active,
    replayBacking: r.takePlayback.withBacking,
    externalClock: r.exerciseLoop.active,
    onStatus: (status) => {
      if (r.exerciseLoop.active && (status.playing !== undefined || status.tick !== undefined))
        return;
      r.updatePlayer(status);
      if (status.playing === false) r.takePlayback.pauseAudio();
    },
    onReady: r.setApi,
    onFinish: () => {
      if (r.exerciseLoop.active) return;
      r.gymActivity.finish();
      r.takes.finish(true);
      r.takePlayback.stop(false);
    },
    onPosition: (tick, bpm) => {
      if (r.exerciseLoop.active) return;
      r.takes.onPosition(tick, bpm);
      r.takePlayback.onPosition(tick);
      r.midiOut.onPosition(tick);
    },
  });
  return (
    <div className="score-paper" aria-label="Interactive sheet music and tablature">
      {r.player.rendering && (
        <div className="score-loading">
          <LoaderCircle size={18} className="spin" />
          Setting out your music…
        </div>
      )}
      {r.player.error && (
        <div className="notice notice-error" role="alert">
          {r.player.error}
        </div>
      )}
      <div className="score-content">
        <div ref={host} className="notation-host" />
        <TakeWaveform />
      </div>
    </div>
  );
}
