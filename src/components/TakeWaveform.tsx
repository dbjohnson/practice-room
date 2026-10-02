import { useMemo } from 'react';
import { useRoom } from '../app/RoomContext';
import { waveformLayout } from '../music/waveformLayout';

export function TakeWaveform() {
  const r = useRoom();
  const waveform = r.takes.audio.waveform;
  const api = r.api.current;
  const bounds = api?.boundsLookup;
  const path = useMemo(() => {
    if (!api || !waveform || waveform.pieceId !== r.library.piece.id || waveform.track !== r.track)
      return '';
    return waveformLayout(api, waveform.points, r.track);
  }, [api, bounds, waveform, r.library.piece.id, r.track, r.player.rendering]);
  if (!path) return null;
  return (
    <svg
      className="take-waveform"
      role="img"
      aria-label={r.takes.recording ? 'Live recorded waveform' : 'Recorded take waveform'}
    >
      <path d={path} />
    </svg>
  );
}
