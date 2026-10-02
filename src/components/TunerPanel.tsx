import { useId, useState } from 'react';
import { Check, Music2 } from 'lucide-react';
import type { InputStatus } from '../domain/types';
import { tunerReading, tunings } from '../audio/tuner';
import { noteName } from '../music/jam';

export function TunerPanel({ status }: { status: InputStatus }) {
  const titleId = useId();
  const [tuning, setTuning] = useState('guitar');
  const [target, setTarget] = useState<number | null>(null);
  const [reference, setReference] = useState(440);
  const preset = tunings.find((p) => p.id === tuning)!;
  const ready = status.state === 'ready';
  const reading = tunerReading(
    ready && !status.clipped ? status.tunerMidi : null,
    target,
    reference,
  );
  const inTune = reading?.direction === 'in-tune';
  const name = reading ? noteName(reading.note) : target === null ? '—' : noteName(target);
  const needle = 300 + Math.max(-50, Math.min(50, reading?.cents ?? 0)) * 5;
  const guidance = !ready
    ? 'Connect your instrument to tune'
    : status.clipped
      ? 'Lower the gain to tune accurately'
      : !reading
        ? 'Pluck one string and let it ring'
        : Math.abs(reading.cents) > 100
          ? 'Check the selected string and octave'
          : inTune
            ? 'In tune'
            : reading.direction === 'flat'
              ? 'A little flat — tune up'
              : 'A little sharp — tune down';
  return (
    <section className={`tuner-panel ${inTune ? 'is-in-tune' : ''}`} aria-labelledby={titleId}>
      <div className="setup-section-heading">
        <span className="setup-number">03</span>
        <h2 id={titleId}>A moment to tune</h2>
        <Music2 size={19} />
      </div>
      <div className="tuner-controls">
        <label>
          Tuning
          <select
            aria-label="Instrument tuning"
            value={tuning}
            onChange={(event) => {
              setTuning(event.target.value);
              setTarget(null);
            }}
          >
            {tunings.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reference
          <select
            aria-label="Tuner reference pitch"
            value={reference}
            onChange={(event) => setReference(Number(event.target.value))}
          >
            {[432, 435, 440, 442, 444].map((hz) => (
              <option key={hz} value={hz}>
                A = {hz} Hz
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tuner-note-display">
        <span className="tuner-mode-label">
          {target === null ? 'AUTO · CHROMATIC' : 'SELECTED STRING'}
        </span>
        <div className={`tuner-note ${!reading ? 'waiting' : ''}`} data-testid="tuner-note">
          {name.replace(/\d+$/, '')}
          <sub>{name.match(/\d+$/)?.[0]}</sub>
          {inTune && (
            <span className="tuner-check">
              <Check size={19} />
            </span>
          )}
        </div>
        <div className="tuner-frequency">
          {reading ? `${reading.frequency.toFixed(1)} Hz` : 'Waiting for a clear, sustained note'}
        </div>
      </div>
      <div
        className={`tuner-dial ${!reading ? 'inactive' : ''}`}
        role="meter"
        aria-label="Tuning deviation"
        aria-valuemin={-50}
        aria-valuemax={50}
        aria-valuenow={Math.max(-50, Math.min(50, reading?.cents ?? 0))}
        aria-valuetext={
          reading
            ? `${name}, ${Math.abs(reading.cents)} cents ${inTune ? 'from center, in tune' : reading.direction}`
            : 'No stable pitch detected'
        }
      >
        <svg viewBox="0 0 600 112" aria-hidden="true">
          <rect x="50" y="37" width="500" height="14" rx="7" className="dial-rail" />
          <rect x="275" y="31" width="50" height="26" rx="6" className="dial-target" />
          {Array.from({ length: 21 }, (_, i) => (
            <line
              key={i}
              x1={50 + i * 25}
              x2={50 + i * 25}
              y1={i % 5 === 0 ? 22 : 28}
              y2={i % 5 === 0 ? 65 : 59}
              className={i === 10 ? 'dial-center' : 'dial-tick'}
            />
          ))}
          <text x="50" y="94" textAnchor="middle">
            −50
          </text>
          <text x="175" y="94" textAnchor="middle">
            −25
          </text>
          <text x="300" y="94" textAnchor="middle">
            0
          </text>
          <text x="425" y="94" textAnchor="middle">
            +25
          </text>
          <text x="550" y="94" textAnchor="middle">
            +50
          </text>
          {reading && (
            <g className="dial-needle" style={{ transform: `translateX(${needle}px)` }}>
              <path d="M-7 5 L7 5 L0 16 Z" />
              <line x1="0" x2="0" y1="14" y2="65" />
            </g>
          )}
        </svg>
        <div className="tuner-dial-labels">
          <span>FLAT</span>
          <strong>
            {reading
              ? `${reading.cents > 0 ? '+' : ''}${reading.cents} cents`
              : '±5 cents · in tune'}
          </strong>
          <span>SHARP</span>
        </div>
      </div>
      <p className={`tuning-guidance ${inTune ? 'tuned' : ''}`} aria-live="polite">
        {guidance}
      </p>
      <div className="tuner-strings" aria-label="Target string">
        <button
          className={target === null ? 'selected' : ''}
          aria-pressed={target === null}
          onClick={() => setTarget(null)}
        >
          Auto
        </button>
        {preset.notes.map((midi, i) => (
          <button
            key={midi}
            className={target === midi ? 'selected' : ''}
            aria-label={`Tune ${noteName(midi)} string`}
            aria-pressed={target === midi}
            onClick={() => setTarget(midi)}
          >
            <small>{preset.notes.length - i}</small>
            <strong>
              {noteName(midi).slice(0, -1)}
              <sub>{noteName(midi).slice(-1)}</sub>
            </strong>
          </button>
        ))}
      </div>
      <p className="tuner-footnote">
        {preset.notes.length
          ? 'Strings run from lowest to highest pitch. Pick a string to keep its target fixed.'
          : 'Chromatic mode finds the nearest note automatically.'}{' '}
        Use a clean tone; mute the other strings.
      </p>
    </section>
  );
}
