import { Minus, Plus } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { keyNames, scoreKey } from '../music/transposeScore';

export function TransposeControl() {
  const r = useRoom();
  const key = scoreKey(r.library.score);
  const original = (((key.pitch - r.transpose) % 12) + 12) % 12;
  return (
    <div className="transpose-control" role="group" aria-label="Key transposition">
      <span>Key</span>
      <button
        className="icon-button"
        aria-label="Transpose down one semitone"
        disabled={r.transpose <= -12}
        onClick={() => r.setTranspose(r.transpose - 1)}
      >
        <Minus size={14} />
      </button>
      <select
        aria-label="Transpose key"
        value={r.transpose}
        onChange={(event) => r.setTranspose(Number(event.target.value))}
      >
        {Array.from({ length: 25 }, (_, i) => i - 12).map((amount) => (
          <option key={amount} value={amount}>
            {keyNames[(((original + amount) % 12) + 12) % 12]}
            {key.minor ? 'm' : ''} (
            {amount === 0 ? 'original' : `${amount > 0 ? '+' : ''}${amount}`})
          </option>
        ))}
      </select>
      <button
        className="icon-button"
        aria-label="Transpose up one semitone"
        disabled={r.transpose >= 12}
        onClick={() => r.setTranspose(r.transpose + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
