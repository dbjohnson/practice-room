import { useState } from 'react';
import { Compass, Library, Upload, WandSparkles } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { FindMusic } from '../components/FindMusic';
import { ImportButton } from '../components/ImportButton';
import { LibraryTable } from '../components/LibraryTable';
import { Modal } from '../components/Modal';
import { libraryPieces } from '../music/libraryView';
import type { Piece } from '../domain/types';

const sections = [
  ['saved', 'Your music', Library],
  ['search', 'Discover', Compass],
  ['create', 'Generate', WandSparkles],
  ['import', 'Import', Upload],
] as const;

export function LibraryPage() {
  const r = useRoom();
  const [section, setSection] = useState<(typeof sections)[number][0]>('saved');
  const [removing, setRemoving] = useState<Piece | null>(null);
  const [addition, setAddition] = useState(0);
  const pieces = libraryPieces(r.library.pieces);
  const added = () => {
    setAddition((value) => value + 1);
    setSection('saved');
  };
  const importFile = async (file: File) => {
    if (r.library.busy) return;
    r.halt();
    if (await r.library.upload(file)) added();
  };
  return (
    <div className="library-page page-enter">
      <div className="page-heading library-heading">
        <div>
          <h1>Your library</h1>
          <p>Find, create and organize the music you want to play.</p>
        </div>
      </div>
      <nav className="library-sections" aria-label="Library sections">
        {sections.map(([id, label, Icon]) => (
          <button
            key={id}
            className={section === id ? 'active' : ''}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            <Icon size={17} />
            {label}
            {id === 'saved' && <span>{pieces.length}</span>}
          </button>
        ))}
      </nav>
      <div hidden={section !== 'saved'}>
        {!!addition && (
          <div className="library-added" role="status">
            <span>
              <strong>{r.library.piece.title}</strong> is ready in your library.
            </span>
            <button
              className="button button-quiet"
              disabled={r.library.busy}
              onClick={() => r.setPage('practice')}
            >
              Open in player
            </button>
            <button className="text-button" onClick={() => setAddition(0)}>
              Dismiss
            </button>
          </div>
        )}
        <LibraryTable
          key={addition}
          pieces={pieces}
          current={r.library.piece}
          busy={r.library.busy}
          onOpen={async (piece) => {
            if (await r.library.select(piece)) r.setPage('practice');
          }}
          onRemove={setRemoving}
          onRename={(piece, title) => r.library.rename(piece.id, title)}
          onDescribe={(piece, description) => r.library.describe(piece.id, description)}
        />
      </div>
      <FindMusic
        mode={section === 'search' || section === 'create' ? section : null}
        onAdded={added}
      />
      <section
        className="library-add-panel"
        hidden={section !== 'import'}
        aria-label="Import music"
      >
        <h2>Import a piece</h2>
        <p className="body-copy">
          Add Guitar Pro, MusicXML or MIDI files to your library. Your files stay on this device.
        </p>
        <div
          className="library-import-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void importFile(file);
          }}
        >
          <Upload size={28} />
          <div>
            <h3>Drop a score here</h3>
            <p>One file at a time, up to 20 MB.</p>
          </div>
          <ImportButton onAdded={added} />
        </div>
      </section>
      <Modal open={!!removing} title="Remove this piece?" onClose={() => setRemoving(null)}>
        <p className="body-copy">
          Remove <strong>{removing?.title}</strong> and all its saved versions from this browser?
          Your original file and saved take history stay intact.
        </p>
        <div className="modal-actions">
          <button className="button button-quiet" onClick={() => setRemoving(null)}>
            Keep it
          </button>
          <button
            className="button button-danger"
            disabled={r.library.busy}
            onClick={async () => {
              if (removing) await r.library.remove(removing.id);
              setRemoving(null);
            }}
          >
            Remove piece
          </button>
        </div>
      </Modal>
    </div>
  );
}
