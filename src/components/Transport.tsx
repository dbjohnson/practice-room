import {
  ChevronDown,
  Circle,
  Minus,
  Pause,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Timer,
  Volume2,
} from 'lucide-react';
import { TempoInput } from './TempoInput';
import { useRoom } from '../app/RoomContext';
import { clampTempo } from '../time/timeline';

export function Transport() {
  const r = useRoom();
  const locked = r.takes.recording;
  const tempoChange = (value: number) => {
    r.halt();
    r.setTempo(clampTempo(value));
  };
  return (
    <div className="transport">
      <div className="transport-top">
        <div className="playback-buttons">
          <button
            className="icon-button"
            aria-label="Restart passage"
            disabled={!r.player.ready || locked}
            onClick={() => r.api.current?.stop()}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className={`play-button ${locked ? 'is-recording' : ''}`}
            onClick={r.play}
            disabled={!r.player.ready}
            aria-label={
              r.player.playing
                ? 'Pause playback'
                : r.mode === 'assess'
                  ? 'Record a take'
                  : 'Play passage'
            }
          >
            {r.player.playing ? (
              <Pause size={21} fill="currentColor" />
            ) : r.mode === 'assess' ? (
              <Circle size={20} fill="currentColor" />
            ) : (
              <Play size={21} fill="currentColor" />
            )}
          </button>
          <button
            className={`icon-button ${r.loop ? 'selected' : ''}`}
            aria-label="Loop passage"
            aria-pressed={r.loop}
            disabled={locked}
            onClick={() => r.setLoop(!r.loop)}
          >
            <Repeat2 size={20} />
          </button>
        </div>
        <div className="tempo-control">
          <button
            className="icon-button"
            aria-label="Decrease tempo"
            onClick={() => tempoChange(r.tempo - 4)}
            disabled={locked}
          >
            <Minus size={15} />
          </button>
          <label>
            <TempoInput
              value={r.tempo}
              label="Tempo BPM"
              disabled={locked}
              onCommit={tempoChange}
            />
            <span>BPM</span>
          </label>
          <button
            className="icon-button"
            aria-label="Increase tempo"
            onClick={() => tempoChange(r.tempo + 4)}
            disabled={locked}
          >
            <Plus size={15} />
          </button>
        </div>
        <input
          className="tempo-slider"
          aria-label="Tempo slider"
          type="range"
          min={30}
          max={240}
          value={r.tempo}
          disabled={locked}
          onChange={(e) => tempoChange(Number(e.target.value))}
        />
        <span className="speed-percent">
          {Math.round((r.tempo / r.library.piece.bpm) * 100)}% <span>of original</span>
        </span>
        <div className="transport-divider" />
        <button
          className={`transport-option ${r.click ? 'selected' : ''}`}
          aria-pressed={r.click}
          onClick={() => r.setClick(!r.click)}
          disabled={locked}
        >
          <Volume2 size={16} />
          Click
        </button>
        <button
          className={`transport-option ${r.countIn ? 'selected' : ''}`}
          aria-pressed={r.countIn}
          onClick={() => r.setCountIn(!r.countIn)}
          disabled={locked}
        >
          <Timer size={16} />
          Count-in
        </button>
      </div>
      <div className="transport-bottom">
        <div className="range-controls">
          <span>LOOP</span>
          <label>
            From{' '}
            <select
              aria-label="Loop start measure"
              value={r.range.start}
              disabled={locked}
              onChange={(e) =>
                r.setRange({
                  start: Number(e.target.value),
                  end: Math.max(Number(e.target.value), r.range.end),
                })
              }
            >
              {Array.from({ length: r.library.piece.bars }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <span className="range-line">—</span>
          <label>
            to{' '}
            <select
              aria-label="Loop end measure"
              value={r.range.end}
              disabled={locked}
              onChange={(e) => r.setRange({ ...r.range, end: Number(e.target.value) })}
            >
              {Array.from({ length: r.library.piece.bars - r.range.start + 1 }, (_, i) => (
                <option key={i} value={i + r.range.start}>
                  {i + r.range.start}
                </option>
              ))}
            </select>
          </label>
          <span className="range-measures">{r.range.end - r.range.start + 1} measures</span>
        </div>
        <span className="playback-status">
          {locked ? (
            <>
              <span className="record-dot" />
              Listening to your take
            </>
          ) : r.player.playing ? (
            `Playing measure ${r.player.bar}`
          ) : r.player.ready ? (
            'Ready when you are'
          ) : (
            'Loading sampled instruments…'
          )}
          <ChevronDown size={13} />
        </span>
      </div>
    </div>
  );
}
