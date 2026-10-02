import {
  AudioLines,
  Dumbbell,
  BookOpen,
  CircleHelp,
  Headphones,
  Library,
  Menu,
  Music2,
  Moon,
  Sun,
  TrendingUp,
} from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useRoom } from '../app/RoomContext';
import type { Page } from '../domain/types';
import { AccountControls } from './AccountControls';
import { useTheme } from '../app/useTheme';

const pages = [
  { id: 'practice' as Page, name: 'Music', Icon: BookOpen },
  { id: 'gym' as Page, name: 'Practice gym', Icon: Dumbbell },
  { id: 'library' as Page, name: 'Your library', Icon: Library },
  { id: 'jam' as Page, name: 'Make a jam', Icon: Music2 },
  { id: 'progress' as Page, name: 'Your progress', Icon: TrendingUp },
  { id: 'instrument' as Page, name: 'Instrument & tuner', Icon: Headphones },
];

export function Shell({ children }: { children: ReactNode }) {
  const room = useRoom();
  const menuId = useId();
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to music
      </a>
      <header className="app-header">
        <button
          className="brand"
          onClick={() => room.setPage('practice')}
          aria-label="Practice Room home"
        >
          <AudioLines size={23} strokeWidth={1.5} />
          <span>practice room.</span>
        </button>
        <button className="navigation-toggle" popoverTarget={menuId} aria-label="Open navigation">
          <Menu size={18} />
          <span>{pages.find((page) => page.id === room.page)?.name}</span>
        </button>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className={`input-connect ${room.input.status.state === 'ready' ? 'connected' : ''}`}
            aria-label="Instrument & tuner"
            onClick={() => room.setPage('instrument')}
          >
            <span className="status-dot" />
            <Headphones size={16} />
            <span className="input-label">
              {room.input.status.state === 'ready' ? 'Connected' : 'Instrument'}
            </span>
          </button>
          <button className="icon-button" aria-label="Help" onClick={() => room.setHelpOpen(true)}>
            <CircleHelp size={18} />
          </button>
        </div>
      </header>
      <div id={menuId} popover="auto" className="navigation-menu">
        <nav aria-label="Main navigation">
          {pages.map(({ id, name, Icon }) => (
            <button
              key={id}
              className={`nav-link ${room.page === id ? 'active' : ''}`}
              aria-current={room.page === id ? 'page' : undefined}
              onClick={() => {
                room.setPage(id);
                document.getElementById(menuId)?.hidePopover();
              }}
            >
              <Icon size={18} strokeWidth={1.6} />
              {name}
              {id === 'library' && <span className="nav-count">{room.library.pieces.length}</span>}
            </button>
          ))}
        </nav>
        <AccountControls />
      </div>
      <main id="main" tabIndex={-1} className={room.page === 'practice' ? 'music-main' : undefined}>
        {children}
      </main>
      {room.toast && (
        <div className="toast" role="status">
          {room.toast}
        </div>
      )}
    </div>
  );
}
