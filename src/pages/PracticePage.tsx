import { useState } from 'react';
import { PieceVersionSelect } from '../components/PieceVersionSelect';
import { ScoreChat } from '../components/ScoreChat';
import {
  ChevronDown,
  ListMusic,
  MessageSquare,
  SlidersHorizontal,
  Waves,
  AudioLines,
} from 'lucide-react';
import { GymSessionBar } from '../components/gym/GymSessionBar';
import { useRoom } from '../app/RoomContext';
import { CoachPanel } from '../components/CoachPanel';
import { Effects } from '../components/Effects';
import { Mixer } from '../components/Mixer';
import { ScoreCanvas } from '../components/ScoreCanvas';
import { ScoreToolbar } from '../components/ScoreToolbar';
import { SectionMap } from '../components/SectionMap';
import { Transport } from '../components/Transport';
import { RecordingControls } from '../components/RecordingControls';
import { PracticeTool } from '../components/PracticeTool';
import { TunerControls } from '../components/TunerControls';

export function PracticePage() {
  const r = useRoom();
  const [chatOpen, setChatOpen] = useState(false);
  if (r.library.empty)
    return (
      <div className="empty-state">
        <h1>Your library is empty</h1>
        <p>Discover, generate or import a piece to start playing.</p>
        <button className="button button-dark" onClick={() => r.setPage('library')}>
          Open library
        </button>
      </div>
    );
  return (
    <div className="music-page">
      <div className="music-heading">
        <div className="music-title">
          <h1>{r.library.piece.title}</h1>
          <button
            className="icon-button"
            aria-label="Choose another piece"
            onClick={() => r.setPage('library')}
          >
            <ChevronDown size={18} />
          </button>
          <PieceVersionSelect />
          <span className="music-meta">
            {r.library.piece.key} · {r.library.piece.bars} measures
          </span>
        </div>
        <div className="music-heading-actions">
          <button
            className="button button-quiet"
            aria-expanded={chatOpen}
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageSquare size={16} /> Edit with AI
          </button>
        </div>
      </div>
      {r.library.warnings.length > 0 && (
        <details className="import-details">
          <summary>Score notes · {r.library.warnings.length}</summary>
          {r.library.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </details>
      )}
      <GymSessionBar />
      <div className={`score-workspace${chatOpen ? ' with-chat' : ''}`}>
        <section className="score-card" aria-label="Music and playback">
          <ScoreToolbar />
          <RecordingControls />
          <ScoreCanvas />
          <div className="practice-tools">
            <PracticeTool label="Tuner" Icon={AudioLines}>
              <TunerControls />
            </PracticeTool>
            <PracticeTool label="Mixer" Icon={SlidersHorizontal}>
              <Mixer />
            </PracticeTool>
            <PracticeTool label="Effects" Icon={Waves}>
              <Effects />
            </PracticeTool>
            <PracticeTool label="Passages" Icon={ListMusic}>
              <SectionMap />
            </PracticeTool>
            <PracticeTool label="Feedback" Icon={MessageSquare}>
              <CoachPanel />
            </PracticeTool>
          </div>
          <Transport />
        </section>
        {chatOpen && <ScoreChat onClose={() => setChatOpen(false)} />}
      </div>
    </div>
  );
}
