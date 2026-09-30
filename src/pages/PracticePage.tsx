import { ArrowUpRight, ChevronDown, Music2, SlidersHorizontal } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { AlbumArt } from '../components/AlbumArt';
import { CoachPanel } from '../components/CoachPanel';
import { ImportButton } from '../components/ImportButton';
import { Mixer } from '../components/Mixer';
import { ScoreCanvas } from '../components/ScoreCanvas';
import { SectionMap } from '../components/SectionMap';
import { Transport } from '../components/Transport';
import type { PracticeMode, View } from '../domain/types';

export function PracticePage() {
  const r = useRoom();
  const headings = {
    phrase: [
      'YOUR REHEARSAL WORKBENCH',
      'A little better, one phrase at a time.',
      'Slow down the difficult part. Find your way through it.',
    ],
    trail: [
      'YOUR GUIDED PRACTICE',
      'Your next step is right here.',
      'A small, thoughtful session built around your music.',
    ],
    pocket: [
      'YOUR REHEARSAL ROOM',
      'Good company. A better groove.',
      'Take your place in the band and make the music yours.',
    ],
  };
  const copy = headings[r.concept];
  return (
    <div className="practice-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" />
            {copy[0]}
          </div>
          <h1>{copy[1]}</h1>
          <p>{copy[2]}</p>
        </div>
        <ImportButton compact />
      </div>
      <div className="piece-heading">
        <AlbumArt color={r.library.piece.color} small />
        <div className="piece-title">
          <div className="piece-source">
            {r.library.piece.source === 'import'
              ? 'FROM YOUR LIBRARY'
              : r.library.piece.source === 'jam'
                ? 'YOUR GENERATED JAM'
                : 'ORIGINAL PRACTICE STUDY'}
          </div>
          <h2>
            {r.library.piece.title}
            <button
              className="icon-button"
              aria-label="Choose another piece"
              onClick={() => r.setPage('library')}
            >
              <ChevronDown size={18} />
            </button>
          </h2>
          <div className="piece-meta">
            <span>{r.library.piece.key}</span>
            <span>{r.library.piece.bpm} BPM original</span>
            <span>{r.library.piece.bars} measures</span>
          </div>
        </div>
        <button className="text-button library-shortcut" onClick={() => r.setPage('library')}>
          Your library <ArrowUpRight size={15} />
        </button>
      </div>
      {r.library.warnings.length > 0 && (
        <details className="import-details">
          <summary>Import notes · {r.library.warnings.length} things to know</summary>
          {r.library.warnings.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </details>
      )}
      <div className="practice-grid">
        <div className="practice-main">
          <SectionMap />
          <section className="score-card">
            <div className="score-toolbar">
              <div className="part-select">
                <Music2 size={15} />
                <select
                  aria-label="Your instrument part"
                  disabled={r.takes.recording}
                  value={r.track}
                  onChange={(e) => {
                    r.halt();
                    r.setTrack(Number(e.target.value));
                  }}
                >
                  {r.library.score.tracks.map((t) => (
                    <option value={t.index} key={t.index}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="segmented small" aria-label="Notation view">
                {(['both', 'score', 'tab'] as View[]).map((v) => (
                  <button
                    key={v}
                    aria-pressed={r.view === v}
                    className={r.view === v ? 'active' : ''}
                    onClick={() => r.setView(v)}
                  >
                    {v === 'both' ? 'Score + tab' : v === 'score' ? 'Score' : 'Tab'}
                  </button>
                ))}
              </div>
            </div>
            <div className="practice-modes">
              {(
                [
                  { value: 'listen', label: '01', name: 'Listen' },
                  { value: 'along', label: '02', name: 'Play along' },
                  { value: 'assess', label: '03', name: 'Check take' },
                ] as { value: PracticeMode; label: string; name: string }[]
              ).map((m) => (
                <button
                  key={m.value}
                  className={r.mode === m.value ? 'active' : ''}
                  onClick={() => r.setMode(m.value)}
                >
                  <span>{m.label}</span>
                  {m.name}
                </button>
              ))}
              <span className="mode-hint">
                {r.mode === 'listen'
                  ? 'Hear your part in the band'
                  : r.mode === 'along'
                    ? 'Your selected part is muted'
                    : 'Experimental · clean single notes'}
              </span>
            </div>
            <ScoreCanvas />
            <Transport />
          </section>
          <Mixer />
          <div className="workspace-note">
            <SlidersHorizontal size={14} />
            <span>
              One shared player. Your piece, tempo and loop stay with you when you switch designs.
            </span>
          </div>
        </div>
        <CoachPanel />
      </div>
    </div>
  );
}
