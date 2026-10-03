import { useState } from 'react';
import { ArrowUpRight, Library, Music2, Search, Trash2, Upload } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { AlbumArt } from '../components/AlbumArt';
import { FindMusic } from '../components/FindMusic';
import { ImportButton } from '../components/ImportButton';
import { Modal } from '../components/Modal';

export function LibraryPage() {
  const r = useRoom();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All music');
  const [removing, setRemoving] = useState<string | null>(null);
  const pieces = r.library.pieces.filter(
    (p) =>
      p.source !== 'exercise' &&
      `${p.title} ${p.subtitle} ${p.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'All music' ||
        (filter === 'Your imports' && p.source === 'import') ||
        (filter === 'Your jams' && p.source === 'jam')),
  );
  return (
    <div className="library-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" />
            THE MUSIC YOU WANT TO PLAY
          </div>
          <h1>A shelf full of possibilities.</h1>
          <p>Your pieces, your practice studies, your next favorite groove.</p>
        </div>
        <div className="page-heading-actions">
          <FindMusic />
          <ImportButton />
        </div>
      </div>
      <div className="library-tools">
        <div className="segmented">
          {['All music', 'Your imports', 'Your jams'].map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search your music"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a piece…"
          />
        </label>
      </div>
      <div className="piece-grid">
        {pieces.map((piece) => (
          <article className="piece-card" key={piece.id}>
            <button
              className="piece-cover-button"
              aria-label={`Open ${piece.title}`}
              disabled={r.library.busy}
              onClick={async () => {
                if (await r.library.select(piece)) r.setPage('practice');
              }}
            >
              <AlbumArt color={piece.color} />
              <span className="cover-open">
                <ArrowUpRight size={23} />
              </span>
            </button>
            <div className="piece-card-copy">
              <div className="card-source">
                {piece.source === 'study'
                  ? 'ORIGINAL STUDY'
                  : piece.source === 'jam'
                    ? 'YOUR JAM'
                    : (piece.origin?.name.toUpperCase() ?? 'YOUR IMPORT')}
                <span>{piece.bars} bars</span>
              </div>
              <h2>
                <button
                  onClick={async () => {
                    if (await r.library.select(piece)) r.setPage('practice');
                  }}
                  disabled={r.library.busy}
                >
                  {piece.title}
                </button>
              </h2>
              <p>{piece.subtitle}</p>
              <div className="piece-card-footer">
                <span title={piece.origin?.licence}>
                  <Music2 size={13} />
                  {piece.key} · {piece.bpm} BPM
                </span>
                {piece.source !== 'study' && (
                  <button
                    className="icon-button"
                    aria-label={`Remove ${piece.title}`}
                    onClick={() => setRemoving(piece.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!pieces.length && (
        <div className="empty-state">
          <Library size={32} />
          <h2>A little room for new music.</h2>
          <p>
            {query
              ? 'No pieces match that search.'
              : filter === 'Your jams'
                ? 'Create a jam and it will be waiting here.'
                : 'Find a piece, or import a Guitar Pro, MusicXML or MIDI file.'}
          </p>
          <button
            className="button button-quiet"
            onClick={() => {
              setQuery('');
              setFilter('All music');
            }}
          >
            Show all music
          </button>
        </div>
      )}
      <div
        className="library-import-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file && !r.library.busy && (await r.library.upload(file))) r.setPage('practice');
        }}
      >
        <div className="upload-circle">
          <Upload size={25} />
        </div>
        <div>
          <h3>Bring the music you’re working on.</h3>
          <p>
            Drop a Guitar Pro, MusicXML or MIDI file here. Up to 20 MB. Your files stay on this
            device.
          </p>
        </div>
        <ImportButton compact />
      </div>
      <Modal open={!!removing} title="Remove this piece?" onClose={() => setRemoving(null)}>
        <p className="body-copy">
          This removes the saved score from this browser. Your original file and saved take history
          stay intact.
        </p>
        <div className="modal-actions">
          <button className="button button-quiet" onClick={() => setRemoving(null)}>
            Keep it
          </button>
          <button
            className="button button-danger"
            onClick={async () => {
              if (removing) await r.library.remove(removing);
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
