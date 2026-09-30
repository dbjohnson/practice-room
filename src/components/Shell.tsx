import {
  AudioLines,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Headphones,
  Library,
  Music2,
  Route,
  Sparkles,
  TrendingUp,
  Waves,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useRoom } from '../app/RoomContext';
import type { Concept, Page } from '../domain/types';
import { AccountControls } from './AccountControls';

const concepts = [
  { id: 'phrase' as Concept, name: 'Phrase', label: 'Learn the piece', Icon: Waves },
  { id: 'trail' as Concept, name: 'Trail', label: 'Find your next step', Icon: Route },
  { id: 'pocket' as Concept, name: 'Pocket', label: 'Play with the band', Icon: AudioLines },
];
const pages = [
  { id: 'practice' as Page, name: 'Practice', Icon: BookOpen },
  { id: 'library' as Page, name: 'Your library', Icon: Library },
  { id: 'jam' as Page, name: 'Make a jam', Icon: Music2 },
  { id: 'progress' as Page, name: 'Your progress', Icon: TrendingUp },
  { id: 'instrument' as Page, name: 'Instrument & tuner', Icon: Headphones },
];

export function Shell({ children }: { children: ReactNode }) {
  const room = useRoom();
  return (
    <div className={`app concept-${room.concept}`}>
      <a className="skip-link" href="#main">
        Skip to practice
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => room.setPage('practice')}
          aria-label="Practice Room home"
        >
          <span className="brand-mark">
            <AudioLines size={25} strokeWidth={1.7} />
          </span>
          <span>
            practice<span className="brand-room">room.</span>
          </span>
        </button>
        <div className="sidebar-label">THREE WAYS TO PLAY</div>
        <div className="concept-nav" aria-label="Design concept">
          {concepts.map(({ id, name, label, Icon }) => (
            <button
              key={id}
              className={`concept-button ${room.concept === id ? 'active' : ''}`}
              onClick={() => room.setConcept(id)}
              aria-pressed={room.concept === id}
            >
              <Icon size={21} strokeWidth={1.6} />
              <span>
                <strong>{name}</strong>
                <small>{label}</small>
              </span>
              {room.concept === id && <span className="concept-dot" />}
            </button>
          ))}
        </div>
        <div className="sidebar-divider" />
        <div className="sidebar-label">YOUR ROOM</div>
        <nav>
          {pages.map(({ id, name, Icon }) => (
            <button
              key={id}
              className={`nav-link ${room.page === id ? 'active' : ''}`}
              onClick={() => room.setPage(id)}
              aria-current={room.page === id ? 'page' : undefined}
            >
              <Icon size={18} strokeWidth={1.6} />
              {name}
              {id === 'library' && <span className="nav-count">{room.library.pieces.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="daily-note">
            <Sparkles size={17} />
            <p>
              A little more music.
              <br />
              <em>Every day.</em>
            </p>
          </div>
          <button className="sidebar-help" onClick={() => room.setHelpOpen(true)}>
            <CircleHelp size={16} />
            About this prototype <ChevronRight size={14} />
          </button>
          <span className="local-note">
            <span /> Saved on this device
          </span>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Your room</span>
            <ChevronRight size={13} />
            <strong>{pages.find((p) => p.id === room.page)?.name}</strong>
          </div>
          <div className="topbar-actions">
            <span className="prototype-badge">
              DESIGN LAB <span>01</span>
            </span>
            <button
              className={`input-connect ${room.input.status.state === 'ready' ? 'connected' : ''}`}
              onClick={() => room.setPage('instrument')}
            >
              <span className="status-dot" />
              <Headphones size={16} />
              <span>
                {room.input.status.state === 'ready'
                  ? 'Instrument connected'
                  : 'Connect instrument'}
              </span>
            </button>
          </div>
        </header>
        <AccountControls />
        <main id="main">{children}</main>
        <footer className="app-footer">
          <span>Made for the part you can’t quite play. Yet.</span>
          <span>PHRASE · TRAIL · POCKET</span>
        </footer>
      </div>
      {room.toast && (
        <div className="toast" role="status">
          {room.toast}
        </div>
      )}
    </div>
  );
}
