import { useRoom } from '../app/RoomContext';
import { pieceVersions } from '../domain/revisions';

export function PieceVersionSelect() {
  const r = useRoom();
  const saved = pieceVersions(r.library.pieces, r.library.piece);
  const versions = saved.some((piece) => piece.id === r.library.piece.id)
    ? saved
    : [...saved, r.library.piece];
  return (
    <select
      className="piece-version-select"
      aria-label="Piece version"
      title={r.library.piece.revision?.prompt ?? 'Original score'}
      value={r.library.piece.id}
      disabled={r.library.busy || r.takes.recording}
      onChange={(event) => {
        const piece = versions.find((item) => item.id === event.target.value);
        if (piece) {
          r.halt();
          void r.library.select(piece);
        }
      }}
    >
      {versions.map((piece) => (
        <option key={piece.id} value={piece.id}>
          {piece.revision ? `Version ${piece.revision.number}` : 'Original'}
        </option>
      ))}
    </select>
  );
}
