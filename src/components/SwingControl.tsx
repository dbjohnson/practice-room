import { useRoom } from '../app/RoomContext';
import { writtenSwing } from '../music/swing';

export function SwingControl() {
  const r = useRoom();
  const locked =
    r.gymRunMatches ||
    r.takes.recording ||
    r.takePlayback.active ||
    r.exerciseLoop.active ||
    r.exerciseLoop.preparing;
  const amount = r.swing ?? writtenSwing(r.library.score);
  const description = r.swing === null ? 'As written' : amount === 0 ? 'Straight' : `${amount}%`;
  return (
    <label className="swing-control">
      <span>
        Swing <output>{description}</output>
      </span>
      <input
        type="range"
        aria-label="Swing"
        aria-valuetext={`${amount} percent${amount === 0 ? ', straight' : amount === 50 ? ', triplet swing' : ''}`}
        min={0}
        max={100}
        step={1}
        value={amount}
        disabled={locked}
        onChange={(event) => r.setSwing(Number(event.target.value))}
      />
      <small>
        <span>Straight</span>
        <span>Triplet</span>
        <span>Heavy</span>
      </small>
      <button
        className="text-button swing-reset"
        type="button"
        disabled={locked || r.swing === null}
        onClick={() => r.setSwing(null)}
      >
        Restore written feel
      </button>
    </label>
  );
}
