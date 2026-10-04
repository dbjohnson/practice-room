import { useRef } from 'react';
import { Upload, LoaderCircle } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { importExtensions } from '../music/importScore';

export function ImportButton({
  compact = false,
  onAdded,
}: {
  compact?: boolean;
  onAdded?: () => void;
}) {
  const room = useRoom();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        className={compact ? 'button button-quiet' : 'button button-dark'}
        disabled={room.library.busy || room.takes.recording}
        onClick={() => ref.current?.click()}
      >
        {room.library.busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}{' '}
        {room.library.busy ? 'Opening score…' : 'Import a piece'}
      </button>
      <input
        ref={ref}
        type="file"
        className="visually-hidden"
        aria-label="Import Guitar Pro, MusicXML or MIDI"
        accept={importExtensions.join(',')}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          room.halt();
          if (await room.library.upload(file)) {
            if (onAdded) onAdded();
            else room.setPage('practice');
          }
        }}
      />
    </>
  );
}
