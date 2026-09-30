import { ArrowRight, Check, FlaskConical, Save, TriangleAlert } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { coaching } from '../audio/assessment';
import { noteName } from '../music/jam';
import { Modal } from './Modal';
import { clampTempo } from '../time/timeline';

export function ReviewDialog() {
  const r = useRoom();
  const take = r.takes.review;
  const advice = take ? coaching(take) : null;
  const saved = take && r.takes.takes.some((t) => t.id === take.id);
  return (
    <Modal
      open={!!take}
      onClose={() => r.takes.setReview(null)}
      title="A moment to hear what changed"
      wide
    >
      {take && advice && (
        <>
          <div className="review-subtitle">
            <span>
              {take.pieceTitle} · {take.trackName} · measures {take.range.start}–{take.range.end} ·{' '}
              {take.tempo} BPM
            </span>
            <span className={`pill ${take.origin === 'example' ? 'pill-example' : ''}`}>
              {take.origin === 'example' ? (
                <>
                  <FlaskConical size={13} />
                  Illustrative example
                </>
              ) : (
                'Experimental input analysis'
              )}
            </span>
          </div>
          {take.interrupted && (
            <p className="notice">
              This take stopped early. Only notes reached during playback were considered.
            </p>
          )}
          <div className="review-stats">
            <div>
              <small>NOTES MATCHED</small>
              <strong>{take.pitchAccuracy === null ? '—' : `${take.pitchAccuracy}%`}</strong>
              <span>of assessable notes</span>
            </div>
            <div>
              <small>MEDIAN TIMING DISTANCE</small>
              <strong>
                {take.timingMs === null ? '—' : `${Math.round(take.timingMs)}`}
                <em>{take.timingMs !== null && ' ms'}</em>
              </strong>
              <span>estimate · not calibrated</span>
            </div>
            <div>
              <small>ASSESSABLE NOTES</small>
              <strong>{take.coverage}%</strong>
              <span>unclear notes stay ungraded</span>
            </div>
          </div>
          <div className="review-body">
            <div className="note-evidence">
              <div className="section-label">
                THE PHRASE, NOTE BY NOTE <span>{take.notes.length} expected notes</span>
              </div>
              <div className="note-grid">
                {take.notes.slice(0, 80).map((note, i) => (
                  <div
                    key={i}
                    className={`evidence-note note-${note.status}`}
                    title={`Bar ${note.bar}: expected ${noteName(note.midi)}; ${note.status}${note.delta !== null ? `; ${note.delta} ms` : ''}`}
                  >
                    <small>{note.bar}</small>
                    <strong>
                      {note.status === 'unclear'
                        ? '?'
                        : note.status === 'missed'
                          ? '—'
                          : noteName(note.midi)}
                    </strong>
                    <span>
                      {note.status === 'matched' ? (
                        <Check size={12} />
                      ) : note.status === 'pitch' ? (
                        'pitch'
                      ) : note.status === 'missed' ? (
                        'missed'
                      ) : (
                        'unclear'
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {take.notes.length > 80 && (
                <p className="muted-copy">
                  Showing the first 80 events. All events contribute to the summary.
                </p>
              )}
              <div className="evidence-legend">
                <span>
                  <i className="matched" />
                  Matched
                </span>
                <span>
                  <i className="pitch" />
                  Pitch / missed
                </span>
                <span>
                  <i className="unclear" />
                  Unclear
                </span>
              </div>
            </div>
            <div className="review-coach">
              <div className="eyebrow">ONE USEFUL NEXT STEP</div>
              <h3>{advice.title}</h3>
              <p>{advice.body}</p>
              <button
                className="button button-primary"
                onClick={() => {
                  r.takes.setReview(null);
                  if (advice.kind === 'input') {
                    r.setPage('instrument');
                    return;
                  }
                  if (take.pieceId !== r.library.piece.id) {
                    r.setPage('library');
                    r.notify(`Open ${take.pieceTitle} to work on this passage.`);
                    return;
                  }
                  r.setTempo(clampTempo(take.tempo + (advice.kind === 'advance' ? 4 : -8)));
                  const trouble =
                    take.notes.find(
                      (n) => n.status === 'pitch' || (n.delta !== null && Math.abs(n.delta) > 35),
                    )?.bar ?? take.range.start;
                  if (take.pieceId === r.library.piece.id)
                    r.setRange(
                      advice.kind === 'advance'
                        ? take.range
                        : {
                            start: Math.max(1, trouble - 1),
                            end: Math.min(r.library.piece.bars, trouble),
                          },
                    );
                  r.setClick(advice.kind === 'timing');
                  r.setMode('along');
                  r.setPage('practice');
                }}
              >
                {take.pieceId !== r.library.piece.id && advice.kind !== 'input'
                  ? 'Find this piece in your library'
                  : advice.action}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
          <div className="notice">
            <TriangleAlert size={16} />
            <span>
              {take.origin === 'example'
                ? 'This example lets you explore the feedback design. It is not a recording of you and cannot earn progress.'
                : 'This is a clean single-note prototype, not a validated music teacher. Chords, bends and ambiguous input remain ungraded. Timing includes unmeasured device latency.'}
            </span>
          </div>
          <div className="modal-actions">
            <button className="button button-quiet" onClick={() => r.takes.setReview(null)}>
              Back to the music
            </button>
            {take.origin !== 'example' && (
              <button
                className="button button-dark"
                disabled={!!saved}
                onClick={() => r.takes.save(take)}
              >
                {saved ? <Check size={16} /> : <Save size={16} />}
                {saved ? 'Take saved' : 'Save this take'}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
