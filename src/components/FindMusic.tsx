import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { listSources } from '../app/sourcesClient';
import type { SourcesResponse } from '../domain/sources';
import { GeneratePiece } from './GeneratePiece';
import { Modal } from './Modal';
import { SourceSearch } from './SourceSearch';

export function FindMusic() {
  const room = useRoom();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'search' | 'create'>('search');
  const [available, setAvailable] = useState<SourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || available) return;
    const abort = new AbortController();
    listSources(abort.signal)
      .then(setAvailable)
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Unavailable.');
      });
    return () => abort.abort();
  }, [open, available]);
  const added = async (adding: Promise<boolean>) => {
    if (!(await adding)) return;
    setOpen(false);
    room.setPage('practice');
  };
  return (
    <>
      <button
        className="button button-quiet"
        disabled={room.takes.recording}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Compass size={16} /> Find music
      </button>
      <Modal open={open} title="Find something to play" onClose={() => setOpen(false)} wide>
        <div className="segmented find-tabs">
          <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>
            Search catalogues
          </button>
          <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
            Write one for me
          </button>
        </div>
        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}
        {available && tab === 'search' && (
          <SourceSearch
            sources={available.sources}
            busy={room.library.busy}
            onAdd={(hit, name, filename, bytes) => {
              room.halt();
              void added(
                room.library.add(filename, bytes, {
                  source: hit.source,
                  name,
                  id: hit.id,
                  licence: hit.licence,
                  url: hit.url,
                  title: hit.title,
                  artist: hit.artist,
                }),
              );
            }}
          />
        )}
        {available && tab === 'create' && (
          <GeneratePiece
            ready={available.generation}
            busy={room.library.busy}
            onAdd={(prompt, bytes) => {
              room.halt();
              void added(
                room.library.add('piece.alphatex', bytes, {
                  source: 'generated',
                  name: 'Written for you',
                  id: prompt,
                  licence: 'Generated for your practice',
                  url: '',
                }),
              );
            }}
          />
        )}
      </Modal>
    </>
  );
}
