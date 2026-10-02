import { useRoom } from '../app/RoomContext';

export function SectionMap() {
  const r = useRoom();
  const bars = r.library.piece.bars;
  const size = Math.ceil(bars / Math.min(8, Math.ceil(bars / 4)));
  const chunks = Array.from({ length: Math.ceil(bars / size) }, (_, index) => ({
    start: index * size + 1,
    end: Math.min(bars, (index + 1) * size),
  }));
  return (
    <section className="passage-map" aria-label="Choose a passage">
      <h2>Choose a passage</h2>
      <div className="passage-buttons">
        {chunks.map((range) => (
          <button
            className="button button-quiet"
            key={range.start}
            aria-pressed={r.range.start === range.start && r.range.end === range.end}
            disabled={r.takes.recording || r.gymRunMatches}
            onClick={() => r.setRange(range)}
          >
            Measures {range.start}–{range.end}
          </button>
        ))}
        <button
          className="button button-quiet"
          disabled={r.takes.recording || r.gymRunMatches}
          onClick={() => r.setRange({ start: 1, end: bars })}
        >
          Whole piece
        </button>
      </div>
    </section>
  );
}
