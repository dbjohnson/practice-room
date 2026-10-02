import { useRoom } from '../app/RoomContext';

export function PassFeedback() {
  const r = useRoom();
  const take = r.takes.passResult;
  if (!take || take.pieceId !== r.library.piece.id) return null;
  const percent = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : `${value}%`;
  return (
    <div
      className="pass-feedback"
      role="status"
      aria-label="Pass accuracy"
      aria-live="polite"
      aria-atomic="true"
    >
      <strong>{take.pass ? `Pass ${take.pass}` : 'Pass result'}</strong>
      <span>
        Pitch <b>{percent(take.pitchAccuracy)}</b>
      </span>
      <span>
        Timing <b>{percent(take.timingScore)}</b>
      </span>
      <span className="pass-coverage">
        Pitch coverage {take.coverage}% · Timing coverage {take.timingCoverage ?? take.coverage}%
      </span>
      <span className="pass-estimate">{take.audio ? 'Recorded analysis' : 'Live estimate'}</span>
      <button
        className="text-button"
        disabled={r.player.playing || r.takes.recording}
        onClick={() => r.takes.setReview(take)}
      >
        Review
      </button>
    </div>
  );
}
