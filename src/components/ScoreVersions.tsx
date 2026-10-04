import type { Piece } from '../domain/types';

export function ScoreVersions({
  versions,
  current,
  disabled,
  onSelect,
}: {
  versions: Piece[];
  current: Piece;
  disabled: boolean;
  onSelect: (piece: Piece) => void;
}) {
  return (
    <>
      <div className="score-chat-history" role="log" aria-label="Piece edit history">
        {versions.length === 1 && !current.revision?.prompt && (
          <p className="muted-copy">
            Ask for a change to this piece: simplify a passage, add a part, change the groove or
            extend a section.
          </p>
        )}
        {versions
          .filter((piece) => piece.revision?.prompt)
          .map((piece) => (
            <div key={piece.id} className="score-chat-turn">
              <p className="score-chat-request">{piece.revision!.prompt}</p>
              <div className="score-chat-result">
                <span>
                  Saved version {piece.revision!.number}
                  {piece.revision!.parentId &&
                    ` from version ${versions.find((p) => p.id === piece.revision!.parentId)?.revision?.number ?? 1}`}
                  .
                </span>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={disabled || piece.id === current.id}
                  onClick={() => onSelect(piece)}
                >
                  {piece.id === current.id ? 'Viewing' : 'Open version'}
                </button>
              </div>
            </div>
          ))}
      </div>
    </>
  );
}
