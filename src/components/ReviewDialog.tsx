import { ArrowRight, Check, FlaskConical, Save, TriangleAlert } from 'lucide-react';
import { GymReview } from './gym/GymReview';
import { useRoom } from '../app/RoomContext';
import { coaching } from '../audio/assessment';
import { noteName } from '../music/jam';
import { Modal } from './Modal';
import { clampTempo } from '../time/timeline';
import { DownloadRecording } from './RecordingControls';

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
          <GymReview take={take} />
          <div className="review-subtitle">
            <span>
              {take.pieceTitle} · {take.trackName} · measures {take.range.start}–{take.range.end} ·{' '}
              {take.tempo} BPM
              {take.transpose
                ? ` · transposed ${take.transpose > 0 ? '+' : ''}${take.transpose} semitones`
                : ''}
            </span>
            <span className={`pill ${take.origin === 'example' ? 'pill-example' : ''}`}>
              {take.origin === 'example' ? (
                <>
                  <FlaskConical size={13} />
                  Illustrative example
                </>
              ) : take.origin === 'midi' ? (
                'MIDI instrument'
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
          {r.takes.audio.processing && (
            <p className="notice" role="status">
              Preparing your audio recording…
            </p>
          )}
          {take.audio && (
            <div className="recording-controls">
              <button
                className="button button-primary"
                disabled={r.preparingReplay}
                onClick={() => void r.replayTake(take)}
              >
                Play take with score
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={r.takePlayback.withBacking}
                  onChange={(event) => r.takePlayback.setWithBacking(event.target.checked)}
                />
                Backing track
              </label>
              <DownloadRecording take={take} />
            </div>
          )}
          <div className="review-stats">
            <div>
              <small>TAKE SCORE</small>
              <strong>{take.overallScore == null ? '—' : `${take.overallScore}%`}</strong>
              <span>50% notes + 50% timing</span>
            </div>
            <div>
              <small>NOTES</small>
              <strong>{take.pitchAccuracy === null ? '—' : `${take.pitchAccuracy}%`}</strong>
              <span>correct notes / assessable notes</span>
            </div>
            <div>
              <small>TIMING</small>
              <strong>{take.timingScore == null ? '—' : `${take.timingScore}%`}</strong>
              <span>
                {take.timingMs === null
                  ? 'No clear attacks'
                  : `${Math.round(take.timingMs)} ms median offset`}
              </span>
            </div>
            <div>
              <small>NOTE COVERAGE</small>
              <strong>{take.coverage}%</strong>
              <span>
                Timing evidence: {take.timingCoverage ?? take.coverage}% ·{' '}
                {take.calibrated
                  ? `calibrated · ${-(take.latencyMs ?? 0)} ms correction`
                  : take.latencySource === 'reported'
                    ? `${take.latencyMs} ms delay reported by browser · not calibrated`
                    : 'input not calibrated'}
                {take.latencySource && take.placementMs != null && (
                  <>
                    {' · '}
                    {Math.abs(take.placementMs) < 5
                      ? 'on the beat on average'
                      : `${Math.abs(Math.round(take.placementMs))} ms ${take.placementMs > 0 ? 'behind' : 'ahead'} on average`}
                    {take.spreadMs != null && ` ±${Math.round(take.spreadMs)} ms`}
                  </>
                )}
              </span>
            </div>
          </div>
          <p className="muted-copy score-explanation">
            Timing gets full credit within ±25 ms, falling to zero at ±150 ms. Missed notes score
            zero for both. Timing uses detected attacks even when their pitch is unclear; missing
            attacks score zero when other reliable attacks are present. Unclear pitch is excluded
            from the note score. Takes below 60% note or timing coverage have no combined score.
            Note offsets are negative when early and positive when late, after calibration.
          </p>
          <div className="review-body">
            <div className="note-evidence">
              <div className="section-label">
                THE PHRASE, NOTE BY NOTE <span>{take.notes.length} expected notes</span>
              </div>
              <div className="note-grid">
                {take.notes.slice(0, 80).map((note, i) => (
                  <div
                    key={i}
                    className={`evidence-note note-${note.status} ${note.delta !== null && Math.abs(note.delta) > 30 ? 'note-off-time' : ''}`}
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
                    {note.delta !== null && (
                      <span className="note-timing">
                        {note.delta > 0 ? '+' : ''}
                        {note.delta} ms
                      </span>
                    )}
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
                  if (r.gym.run?.status === 'active') r.gym.pause();
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
                  if (r.transpose !== (take.transpose ?? 0)) r.setTranspose(take.transpose ?? 0);
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
                  if (advice.kind === 'timing') r.setClick(true);
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
                : take.origin === 'midi'
                  ? 'MIDI reports the exact keys you played, chords included. Bends, percussion and other expressive notation remain ungraded.'
                  : take.calibrated
                    ? 'Single-note estimates use your input calibration. Chords, bends and ambiguous input remain ungraded.'
                    : 'Single-note estimates use the delay your browser reports, which is often close for a wired interface and wrong for Bluetooth. Calibrate in Input settings for a measured figure. Chords, bends and ambiguous input remain ungraded.'}
            </span>
          </div>
          <div className="modal-actions">
            <button className="button button-quiet" onClick={() => r.takes.setReview(null)}>
              Back to the music
            </button>
            {take.origin !== 'example' && !take.gym && (
              <button
                className="button button-dark"
                disabled={!!saved || r.takes.audio.processing}
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
