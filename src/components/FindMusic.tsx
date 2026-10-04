import { useEffect, useState } from 'react';
import { useRoom } from '../app/RoomContext';
import { acknowledgeGeneration } from '../storage/generationReceipts';
import { listSources } from '../app/sourcesClient';
import type { SourcesResponse } from '../domain/sources';
import { GeneratePiece } from './GeneratePiece';
import { SourceSearch } from './SourceSearch';

export function FindMusic({
  mode,
  onAdded,
}: {
  mode: 'search' | 'create' | null;
  onAdded: () => void;
}) {
  const room = useRoom();
  const [available, setAvailable] = useState<SourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const active = mode !== null;
  const [visited, setVisited] = useState({ search: false, create: false });
  useEffect(() => {
    if (mode) setVisited((previous) => (previous[mode] ? previous : { ...previous, [mode]: true }));
  }, [mode]);
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    listSources(abort.signal)
      .then((result) => {
        setAvailable(result);
        setError(null);
      })
      .catch((reason) => {
        if (!abort.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Unavailable.');
      });
    return () => abort.abort();
  }, [active, attempt]);
  const added = async (adding: Promise<boolean>) => {
    if (await adding) onAdded();
  };
  return (
    <section
      className="library-add-panel"
      hidden={!active}
      aria-label={mode === 'create' ? 'Generate music' : 'Discover music'}
    >
      {error && (
        <div className="notice notice-error" role="alert">
          {error}{' '}
          <button
            className="text-button"
            onClick={() => {
              setError(null);
              setAttempt(attempt + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {!available && !error && <p role="status">Loading music sources…</p>}
      {available && (
        <>
          <div hidden={mode !== 'search'}>
            <h2>Discover music</h2>
            <p className="body-copy">Search the catalogues and add a piece to your library.</p>
            {visited.search && (
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
          </div>
          <div hidden={mode !== 'create'}>
            <h2>Generate a piece</h2>
            <p className="body-copy">Describe the music and instruments you want to practise.</p>
            {visited.create && (
              <GeneratePiece
                ready={available.generation}
                busy={room.library.busy}
                onAdd={(prompt, bytes, jobId) => {
                  room.halt();
                  void added(
                    room.library
                      .add('piece.alphatex', bytes, {
                        source: 'generated',
                        name: 'Written for you',
                        id: prompt,
                        licence: 'Generated for your practice',
                        url: '',
                      })
                      .then((saved) => {
                        if (saved) acknowledgeGeneration(jobId);
                        return saved;
                      }),
                  );
                }}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
