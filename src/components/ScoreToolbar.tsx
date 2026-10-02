import { Music2, ZoomIn, ZoomOut } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { TransposeControl } from './TransposeControl';
import {
  DEFAULT_SCORE_ZOOM,
  MAX_SCORE_ZOOM,
  MIN_SCORE_ZOOM,
  SCORE_ZOOM_STEP,
} from '../app/scoreZoom';
import type { PracticeMode, View } from '../domain/types';

export function ScoreToolbar() {
  const r = useRoom();
  return (
    <div className="score-toolbar">
      <div className="part-select">
        <Music2 size={16} />
        <select
          aria-label="Your instrument part"
          disabled={r.takes.recording}
          value={r.track}
          onChange={(event) => {
            r.halt();
            r.setTrack(Number(event.target.value));
          }}
        >
          {r.library.score.tracks.map((track) => (
            <option value={track.index} key={track.index}>
              {track.name}
            </option>
          ))}
        </select>
      </div>
      <div className="segmented small playback-modes" role="group" aria-label="Playback mode">
        {(
          [
            ['listen', 'Listen'],
            ['along', 'Play along'],
            ['assess', 'Record take'],
          ] satisfies [PracticeMode, string][]
        ).map(([mode, label]) => (
          <button
            key={mode}
            aria-pressed={r.mode === mode}
            className={r.mode === mode ? 'active' : ''}
            disabled={r.takes.recording}
            onClick={() => r.setMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <TransposeControl />
      <span className="mode-hint">
        {r.mode === 'along'
          ? 'Your part is muted'
          : r.mode === 'assess'
            ? 'Clean single notes'
            : ''}
      </span>
      <div className="segmented small" aria-label="Notation view">
        {(['both', 'score', 'tab'] as View[]).map((view) => (
          <button
            key={view}
            aria-pressed={r.view === view}
            className={r.view === view ? 'active' : ''}
            onClick={() => r.setView(view)}
          >
            {view === 'both' ? 'Score + tab' : view === 'score' ? 'Score' : 'Tab'}
          </button>
        ))}
      </div>
      <div className="score-zoom" role="group" aria-label="Score zoom">
        <button
          className="icon-button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={r.zoom <= MIN_SCORE_ZOOM}
          onClick={() => r.setZoom(Math.max(MIN_SCORE_ZOOM, r.zoom - SCORE_ZOOM_STEP))}
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="zoom-reset"
          aria-label={`Zoom ${r.zoom}%. Reset to 100%`}
          title="Reset zoom to 100%"
          onClick={() => r.setZoom(DEFAULT_SCORE_ZOOM)}
        >
          {r.zoom}%
        </button>
        <button
          className="icon-button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={r.zoom >= MAX_SCORE_ZOOM}
          onClick={() => r.setZoom(Math.min(MAX_SCORE_ZOOM, r.zoom + SCORE_ZOOM_STEP))}
        >
          <ZoomIn size={16} />
        </button>
      </div>
    </div>
  );
}
