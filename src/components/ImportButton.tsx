import { useRef } from 'react';
import { Upload, LoaderCircle } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function ImportButton({ compact = false }: { compact?: boolean }) {
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
        aria-label="Import Guitar Pro or MusicXML"
        accept=".gp,.gp3,.gp4,.gp5,.gpx,.xml,.musicxml,.mxl"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          room.halt();
          if (await room.library.upload(file)) room.setPage('practice');
        }}
      />
    </>
  );
}
