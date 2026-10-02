import { useMemo } from 'react';
import { Volume2 } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function ClickControl() {
  const r = useRoom();
  const beat = r.player.beatAt;
  const active = r.player.playing && beat !== undefined;
  // Start at the current phase when a delayed frame delivers a beat. Never
  // restart the flash when another playback-position update rerenders the UI.
  const delay = useMemo(
    () => (beat === undefined ? 0 : Math.max(0, performance.now() - beat)),
    [beat, active],
  );
  return (
    <button
      className={`transport-option ${r.click ? 'selected' : ''}`}
      aria-pressed={r.click}
      onClick={() => r.setClick(!r.click)}
    >
      <span
        key={beat}
        className={`click-beat-icon ${active ? 'is-beating' : ''}`}
        style={{ animationDelay: `-${delay}ms` }}
        aria-hidden="true"
      >
        <Volume2 size={16} />
      </span>
      Click
    </button>
  );
}
