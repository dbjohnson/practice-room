import { LoaderCircle, Music2 } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { useScorePlayer } from '../audio/useScorePlayer';

export function ScoreCanvas() {
  const r = useRoom();
  const host = useScorePlayer({
    score: r.library.score,
    track: r.track,
    tempo: r.tempo,
    range: r.range,
    loop: r.loop,
    view: r.view,
    mode: r.mode,
    click: r.click,
    countIn: r.countIn,
    muted: r.muted,
    volumes: r.volumes,
    onStatus: r.updatePlayer,
    onReady: r.setApi,
    onFinish: () => r.takes.finish(true),
    onPosition: r.takes.onPosition,
  });
  return (
    <div className="score-paper" aria-label="Interactive sheet music and tablature">
      <div className="score-caption">
        <span>
          <Music2 size={14} />
          {r.library.score.tracks[r.track]?.name ?? 'Selected part'}
        </span>
        <span>
          {r.library.piece.key} <b>·</b> {r.tempo} BPM <b>·</b> Select a passage with the measure
          controls
        </span>
      </div>
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
      <div ref={host} className="notation-host" />
    </div>
  );
}
