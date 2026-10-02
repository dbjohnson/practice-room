import { Download, Pause, Play, Save, Square } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import type { Take } from '../domain/types';
import { formatTime } from '../time/timeline';

export function RecordingControls() {
  const r = useRoom();
  const selected = r.takes.audio.selected;
  if (r.takes.audio.processing)
    return (
      <div className="recording-controls" role="status">
        Preparing your recording…
      </div>
    );
  if (r.takes.recording)
    return (
      <div className="recording-controls is-recording" role="status">
        <span className="record-dot" /> Recording your instrument
        <button className="text-button" onClick={r.halt}>
          <Square size={13} />
          Stop take
        </button>
      </div>
    );
  if (!selected || selected.take.pieceId !== r.library.piece.id) return null;
  const saved = r.takes.takes.some((take) => take.id === selected.take.id);
  return (
    <div className="recording-controls">
      <span>Recorded take · {formatTime(selected.data.duration)}</span>
      <button
        className="text-button"
        disabled={r.preparingReplay}
        onClick={() => {
          if (r.takePlayback.active) r.play();
          else void r.replayTake(selected.take);
        }}
      >
        {r.takePlayback.active && r.player.playing ? <Pause size={14} /> : <Play size={14} />}
        {r.takePlayback.active && r.player.playing ? 'Pause take' : 'Play take'}
      </button>
      <label>
        <input
          type="checkbox"
          checked={r.takePlayback.withBacking}
          onChange={(event) => r.takePlayback.setWithBacking(event.target.checked)}
        />
        Backing track
      </label>
      <button className="text-button" onClick={() => r.takes.setReview(selected.take)}>
        Review
      </button>
      <button
        className="text-button"
        disabled={saved}
        onClick={() => void r.takes.save(selected.take)}
      >
        <Save size={13} />
        {saved ? 'Saved' : 'Save take'}
      </button>
      <DownloadRecording take={selected.take} />
    </div>
  );
}

export function DownloadRecording({ take }: { take: Take }) {
  const r = useRoom();
  return (
    <button
      className="text-button"
      onClick={async () => {
        const data = await r.takes.audio.load(take);
        if (!data) return;
        const url = URL.createObjectURL(data.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${take.pieceTitle}-take.wav`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      <Download size={13} />
      Download audio
    </button>
  );
}
