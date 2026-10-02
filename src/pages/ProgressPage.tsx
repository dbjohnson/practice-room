import { useMemo, useState } from 'react';
import { ArrowRight, Clock3, Download, Headphones, Target, TrendingUp, Trash2 } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { practiceMilestones } from '../domain/milestones';
import { formatTime } from '../time/timeline';
import { Modal } from '../components/Modal';

export function ProgressPage() {
  const r = useRoom();
  const [piece, setPiece] = useState('all');
  const [clearOpen, setClearOpen] = useState(false);
  const takes = useMemo(
    () =>
      r.takes.takes.filter(
        (t) => t.origin === 'microphone' && (piece === 'all' || t.pieceId === piece),
      ),
    [r.takes.takes, piece],
  );
  const names = [...new Map(r.takes.takes.map((t) => [t.pieceId, t.pieceTitle])).entries()];
  const minutes = takes.reduce((n, t) => n + t.duration, 0);
  const good = takes.filter(
    (t) =>
      !t.interrupted &&
      t.coverage >= 90 &&
      (t.pitchAccuracy ?? 0) >= 90 &&
      (t.timingScore ?? 0) >= 90,
  );
  const chart = [...takes].reverse().slice(-12);
  const exportHistory = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            schema: 'practice-room-takes-v1',
            exportedAt: new Date().toISOString(),
            takes: r.takes.takes,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'practice-room-history.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="progress-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" />
            EVIDENCE OF YOUR EFFORT
          </div>
          <h1>Your practice progress.</h1>
          <p>Your own takes. The tempo you played. The parts that are coming together.</p>
        </div>
        <button
          className="button button-quiet"
          onClick={exportHistory}
          disabled={!r.takes.takes.length}
        >
          <Download size={16} />
          Export history
        </button>
      </div>
      <button
        className="button button-quiet"
        onClick={() => {
          r.setGymView('progress');
          r.setPage('gym');
        }}
      >
        Gym progress, records & rewards <ArrowRight size={16} />
      </button>
      <div className="progress-summary">
        {[
          {
            icon: Headphones,
            label: 'SAVED TAKES',
            value: String(takes.length),
            sub: 'Real instrument sessions',
          },
          {
            icon: Clock3,
            label: 'TIME PLAYING',
            value: formatTime(minutes),
            sub: 'Across saved takes',
          },
          {
            icon: Target,
            label: 'STRONG TAKES',
            value: String(good.length),
            sub: '90% notes, timing and coverage',
          },
        ].map(({ icon: Icon, label, value, sub }) => (
          <div className="progress-stat" key={label}>
            <span>
              <Icon size={18} />
              {label}
            </span>
            <strong>{value}</strong>
            <p>{sub}</p>
          </div>
        ))}
      </div>
      <div className="milestone-grid" aria-label="Practice milestones">
        {practiceMilestones(r.takes.takes).map((milestone) => (
          <div key={milestone.id} className={`milestone ${milestone.earned ? 'earned' : ''}`}>
            <span>{milestone.earned ? 'EARNED' : 'A SMALL NEXT STEP'}</span>
            <h3>{milestone.title}</h3>
            <p>{milestone.detail}</p>
          </div>
        ))}
      </div>
      {!takes.length ? (
        <div className="progress-empty">
          <div className="empty-illustration">
            <span />
            <span />
            <span />
            <TrendingUp size={44} strokeWidth={1.4} />
          </div>
          <div className="eyebrow">YOUR FIRST SMALL STEP</div>
          <h2>There’s a story waiting to be played.</h2>
          <p>
            Record a short passage, review what the app heard, and save the take. Your history will
            start here, without invented scores or lost streaks.
          </p>
          <button
            className="button button-primary"
            onClick={() => {
              r.setPage('practice');
              r.setMode('assess');
            }}
          >
            Record your first take <ArrowRight size={16} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              r.takes.showExample();
            }}
          >
            Or explore example feedback
          </button>
        </div>
      ) : (
        <>
          <section className="progress-chart-card">
            <div className="progress-chart-heading">
              <div>
                <div className="eyebrow">TAKE SCORES OVER TIME</div>
                <h2>A little more sure of the notes.</h2>
              </div>
              <label>
                Piece
                <select
                  aria-label="Filter progress by piece"
                  value={piece}
                  onChange={(e) => setPiece(e.target.value)}
                >
                  <option value="all">All pieces</option>
                  {names.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="history-chart"
              role="img"
              aria-label="Combined note and timing scores for saved takes, with tempo labels"
            >
              {chart.map((t) => (
                <div className="history-bar" key={t.id}>
                  <span>{t.overallScore == null ? '—' : `${t.overallScore}%`}</span>
                  <div>
                    <i style={{ height: `${t.overallScore ?? 0}%` }} />
                  </div>
                  <strong>{t.tempo}</strong>
                  <small>BPM</small>
                </div>
              ))}
            </div>
            <p className="muted-copy">
              Compare the same piece, part, measures and tempo. This prototype shows estimates, not
              a validated mastery score.
            </p>
          </section>
          <section className="take-history">
            <div className="section-label">
              YOUR PRACTICE LOG <span>{takes.length} saved takes</span>
            </div>
            <div className="history-table">
              <table>
                <thead>
                  <tr>
                    <th>Piece / passage</th>
                    <th>Tempo</th>
                    <th>Take score</th>
                    <th>Notes</th>
                    <th>Timing</th>
                    <th>Coverage</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {takes.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.pieceTitle}</strong>
                        <small>
                          {t.trackName} · bars {t.range.start}–{t.range.end} ·{' '}
                          {new Date(t.createdAt).toLocaleDateString()}
                        </small>
                      </td>
                      <td>{t.tempo} BPM</td>
                      <td>{t.overallScore == null ? '—' : `${t.overallScore}%`}</td>
                      <td>{t.pitchAccuracy === null ? '—' : `${t.pitchAccuracy}%`}</td>
                      <td>
                        {t.timingScore == null ? '—' : `${t.timingScore}%`}
                        <small>
                          {t.timingMs === null ? '' : `${Math.round(t.timingMs)} ms median`}
                        </small>
                      </td>
                      <td>{t.coverage}%</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Review ${t.pieceTitle} take at ${t.tempo} BPM`}
                          onClick={() => r.takes.setReview(t)}
                        >
                          <ArrowRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {!!r.takes.takes.length && (
        <button className="text-button danger-text" onClick={() => setClearOpen(true)}>
          <Trash2 size={14} />
          Clear saved take history
        </button>
      )}
      <Modal open={clearOpen} onClose={() => setClearOpen(false)} title="Clear your saved takes?">
        <p className="body-copy">
          This removes detailed take results and audio recordings from this device. Your music
          library, gym exercises and compact gym progress are kept. Export history for a copy of
          results, and download any recordings you want to keep from their take reviews.
        </p>
        <div className="modal-actions">
          <button className="button button-quiet" onClick={() => setClearOpen(false)}>
            Keep history
          </button>
          <button
            className="button button-danger"
            onClick={() => {
              r.takes.clear();
              setClearOpen(false);
            }}
          >
            Clear history
          </button>
        </div>
      </Modal>
    </div>
  );
}
