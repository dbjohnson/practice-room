import type { RoutineOuterLoop } from '../../domain/gym';

export function RoutineLoopFields({
  value = {},
  tempo = 80,
  onChange,
}: {
  value?: RoutineOuterLoop;
  tempo?: number;
  onChange: (next: RoutineOuterLoop) => void;
}) {
  return (
    <section className="gym-block gym-routine-loop" aria-label="Routine outer loop">
      <h3>Repeat the whole routine</h3>
      <p className="muted-copy">
        Play every exercise in order, then move to the next key. After all keys, increase the tempo
        and repeat. Key changes transpose every exercise by the same interval from its written key.
      </p>
      <label className="gym-check">
        <input
          type="checkbox"
          checked={!!value.tempo}
          onChange={(e) =>
            onChange({
              ...value,
              tempo: e.target.checked ? { startBpm: tempo, endBpm: tempo, bpmStep: 4 } : undefined,
            })
          }
        />
        Routine tempo ladder
      </label>
      {value.tempo && (
        <fieldset className="gym-fields">
          <legend>Tempo for every exercise</legend>
          {(
            [
              ['startBpm', 'Start BPM', 30, 240],
              ['endBpm', 'Target BPM', 30, 240],
              ['bpmStep', 'BPM step', 1, 40],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                value={value.tempo![key]}
                onChange={(e) =>
                  onChange({ ...value, tempo: { ...value.tempo!, [key]: Number(e.target.value) } })
                }
              />
            </label>
          ))}
        </fieldset>
      )}
      <label className="gym-check">
        <input
          type="checkbox"
          checked={!!value.keys}
          onChange={(e) =>
            onChange({
              ...value,
              keys: e.target.checked ? { keyOrder: 'fifths', keyCount: 12 } : undefined,
            })
          }
        />
        Routine key modulation
      </label>
      {value.keys && (
        <fieldset className="gym-fields">
          <legend>Key journey for every exercise</legend>
          <label>
            Key journey
            <select
              value={value.keys.keyOrder}
              onChange={(e) =>
                onChange({
                  ...value,
                  keys: {
                    ...value.keys!,
                    keyOrder: e.target.value as NonNullable<RoutineOuterLoop['keys']>['keyOrder'],
                  },
                })
              }
            >
              <option value="fixed">Stay in written keys</option>
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
              value={value.keys.keyCount}
              disabled={value.keys.keyOrder === 'fixed'}
              onChange={(e) =>
                onChange({ ...value, keys: { ...value.keys!, keyCount: Number(e.target.value) } })
              }
            />
          </label>
        </fieldset>
      )}
      <small className="muted-copy">
        Enabled routine settings replace the corresponding tempo or key journey in every block. Turn
        them off to use each block’s settings again.
      </small>
    </section>
  );
}
