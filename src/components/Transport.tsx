import { Circle, Minus, Pause, Play, Plus, Repeat2, RotateCcw, Timer } from 'lucide-react';
import { TempoInput } from './TempoInput';
import { useRoom } from '../app/RoomContext';
import { clampTempo } from '../time/timeline';
import { PassFeedback } from './PassFeedback';
import { ClickControl } from './ClickControl';

export function Transport() {
  const r = useRoom();
  const locked =
    r.gymRunMatches ||
    r.takes.recording ||
    r.takePlayback.active ||
    r.preparingReplay ||
    r.exerciseLoop.active ||
    r.exerciseLoop.preparing;
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
            className={`play-button ${r.mode === 'assess' && !r.takePlayback.active ? 'is-recording' : ''}`}
            onClick={r.play}
            disabled={
              !r.player.ready ||
              r.takes.audio.processing ||
              r.preparingReplay ||
              (r.gymRunMatches && r.gym.rest > 0)
            }
            aria-label={
              r.exerciseLoop.preparing
                ? 'Cancel loop preparation'
                : r.player.playing
                  ? 'Pause playback'
                  : r.mode === 'assess'
                    ? 'Record a take'
                    : 'Play passage'
            }
          >
            {r.player.playing || r.exerciseLoop.preparing ? (
              <Pause size={21} fill="currentColor" />
            ) : r.mode === 'assess' ? (
              <Circle size={20} fill="currentColor" />
            ) : (
              <Play size={21} fill="currentColor" />
            )}
          </button>
          <button
            className={`icon-button ${r.loop ? 'selected' : ''}`}
            aria-label={r.library.piece.gymSet ? 'Loop full exercise' : 'Loop passage'}
            aria-pressed={r.loop}
            disabled={
              r.takes.recording ||
              r.takePlayback.active ||
              r.preparingReplay ||
              r.exerciseLoop.active ||
              r.exerciseLoop.preparing
            }
            onClick={() => {
              if (!r.loop && r.library.piece.gymSet)
                r.setRange({ start: 1, end: r.library.piece.bars });
              r.setLoop(!r.loop);
            }}
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
        <div className="transport-divider" />
        <ClickControl />
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
        <PassFeedback />
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
        </div>
        <span className="playback-status">
          {r.takes.recording ? (
            <>
              <span className="record-dot" />
              Listening to your take
            </>
          ) : r.exerciseLoop.preparing ? (
            'Preparing continuous loop…'
          ) : r.player.playing ? (
            `Playing measure ${r.player.bar}`
          ) : r.player.ready ? (
            'Ready'
          ) : r.player.instrumentsReady ? (
            'Preparing music…'
          ) : (
            'Loading instruments…'
          )}
        </span>
      </div>
    </div>
  );
}
