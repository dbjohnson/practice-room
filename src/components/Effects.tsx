import { useRoom } from '../app/RoomContext';
import { SwingControl } from './SwingControl';

export function Effects() {
  const r = useRoom();
  return (
    <section className="effects-panel" aria-label="Effects controls">
      {(
        [
          ['compression', 'Compression'],
          ['reverb', 'Reverb'],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          <span>
            {label}
            <output>{r.mixEffects[key] ? `${r.mixEffects[key]}%` : 'Off'}</output>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            aria-label={label}
            aria-valuetext={r.mixEffects[key] ? `${r.mixEffects[key]} percent` : 'Off'}
            value={r.mixEffects[key]}
            onChange={(e) =>
              r.setMixEffects((effects) => ({ ...effects, [key]: Number(e.target.value) }))
            }
          />
          <small>
            <span>Off</span>
            <span>Heavy</span>
          </small>
        </label>
      ))}
      <SwingControl />
    </section>
  );
}
