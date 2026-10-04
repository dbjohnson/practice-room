import { Metronome, ScanLine, Timer } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function ClickControl() {
  const r = useRoom();
  return (
    <div className="beat-controls" role="group" aria-label="Beat controls">
      <button
        className="transport-button"
        aria-label="Count-in"
        title={`Count-in: ${r.countIn ? 'on' : 'off'}`}
        aria-pressed={r.countIn}
        onClick={() => r.setCountIn(!r.countIn)}
      >
        <Timer size={18} />
      </button>

      <button
        className="transport-button"
        aria-label="Metronome click"
        title={`Metronome click: ${r.click ? 'on' : 'off'}`}
        aria-pressed={r.click}
        onClick={() => r.setClick(!r.click)}
      >
        <Metronome size={19} />
      </button>
      <button
        className="transport-button"
        aria-label="Score flash"
        title={`Score flash: ${r.flash ? 'on' : 'off'}`}
        aria-pressed={r.flash}
        onClick={() => r.setFlash(!r.flash)}
      >
        <ScanLine size={19} />
      </button>
    </div>
  );
}
