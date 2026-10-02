import { articulationLabels, rhythmLabels, type WorkoutTransform } from '../../domain/gym';
export function TransformFields({
  value,
  onChange,
  routineTempo = false,
  routineKeys = false,
}: {
  value: WorkoutTransform;
  onChange: (next: WorkoutTransform) => void;
  routineTempo?: boolean;
  routineKeys?: boolean;
}) {
  const update = (key: keyof WorkoutTransform, next: string | number | boolean) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="gym-fields">
      {(
        [
          ['startBpm', 'Start BPM', 30, 240],
          ['endBpm', 'Target BPM', 30, 240],
          ['bpmStep', 'BPM step', 1, 40],
          ['repetitions', 'Repetitions', 1, 20],
        ] as const
      )
        .filter(([key]) => !routineTempo || key === 'repetitions')
        .map(([key, label, min, max]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={min}
              max={max}
              value={value[key]}
              onChange={(e) => update(key, Number(e.target.value))}
            />
          </label>
        ))}
      {routineTempo && <p className="muted-copy">Tempo follows the routine ladder.</p>}
      {routineKeys ? (
        <p className="muted-copy">Key follows the routine modulation.</p>
      ) : (
        <>
          <label>
            Key journey
            <select value={value.keyOrder} onChange={(e) => update('keyOrder', e.target.value)}>
              <option value="fixed">Stay in one key</option>
              <option value="fifths">Circle of fifths</option>
              <option value="fourths">Circle of fourths</option>
              <option value="chromatic">Chromatic steps</option>
            </select>
          </label>
          <label>
            Number of keys
            <input
              type="number"
              min={1}
              max={12}
              disabled={value.keyOrder === 'fixed'}
              value={value.keyCount}
              onChange={(e) => update('keyCount', Number(e.target.value))}
            />
          </label>
        </>
      )}
      <label>
        Rhythm pattern
        <select value={value.rhythm} onChange={(e) => update('rhythm', e.target.value)}>
          <option value="exercise">Exercise default</option>
          {Object.entries(rhythmLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Articulation pattern
        <select value={value.articulation} onChange={(e) => update('articulation', e.target.value)}>
          <option value="exercise">Exercise default</option>
          {Object.entries(articulationLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Rest between sets (seconds)
        <input
          type="number"
          min={0}
          max={120}
          value={value.restSeconds}
          onChange={(e) => update('restSeconds', Number(e.target.value))}
        />
      </label>
      <label>
        Note + timing target (%)
        <input
          type="number"
          min={50}
          max={100}
          value={value.target}
          onChange={(e) => update('target', Number(e.target.value))}
        />
      </label>
      <label className="gym-check gym-span">
        <input
          type="checkbox"
          checked={value.requirePass}
          onChange={(e) => update('requirePass', e.target.checked)}
        />
        Require the target before advancing (you can still skip)
      </label>
    </div>
  );
}
