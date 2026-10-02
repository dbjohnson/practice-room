import { useState } from 'react';
import type { model } from '@coderline/alphatab';
import { useRoom } from '../../app/RoomContext';
import type { Exercise, ExerciseSource } from '../../domain/gym';
import { articulationLabels, patternLabels, rhythmLabels } from '../../domain/gym';
import { scales, starterExercises } from '../../music/exerciseCatalog';
import {
  createExerciseScore,
  loadExerciseScore,
  saveExerciseSource,
} from '../../music/exerciseScore';
import { importScore } from '../../music/importScore';
import { scoreKey, keyNames } from '../../music/transposeScore';
import { validateExercise } from '../../domain/gymValidation';
import { Modal } from '../Modal';

export function ExerciseEditor({ initial, onClose }: { initial?: Exercise; onClose: () => void }) {
  const r = useRoom();
  const [draft, setDraft] = useState<Exercise>(() => ({
    ...structuredClone(initial ?? starterExercises[0]),
    id: initial && !initial.builtin ? initial.id : crypto.randomUUID(),
    builtin: false,
    title: initial
      ? `${initial.title}${initial.builtin ? ' · my version' : ''}`
      : 'My scale exercise',
    createdAt: initial && !initial.builtin ? initial.createdAt : new Date().toISOString(),
  }));
  const [sourceScore, setSourceScore] = useState<model.Score | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const change = (value: Partial<Exercise>) => setDraft((d) => ({ ...d, ...value }));
  const source = draft.source;
  const changeSource = (value: Partial<ExerciseSource>) =>
    change({ source: { ...source, ...value } as ExerciseSource });
  const useScore = (score: model.Score, title?: string) => {
    setSourceScore(score);
    change({
      ...(title ? { title } : {}),
      defaults: {
        ...draft.defaults,
        tempo: Math.max(30, Math.min(240, Math.round(score.tempo))),
        rhythm: 'original',
      },
      source: {
        kind: 'score',
        snapshotId: '',
        key: scoreKey(score).pitch,
        track: 0,
        startBar: 1,
        endBar: Math.min(4, score.masterBars.length),
      },
    });
  };
  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const imported = await importScore(file);
      useScore(imported.score, imported.piece.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this score.');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      let exercise = validateExercise({
        ...draft,
        revision: initial && !initial.builtin ? initial.revision + 1 : 1,
        updatedAt: new Date().toISOString(),
      });
      if (exercise.source.kind === 'score' && sourceScore) {
        createExerciseScore(exercise, undefined, sourceScore);
        exercise = {
          ...exercise,
          source: { ...exercise.source, snapshotId: await saveExerciseSource(sourceScore) },
        };
      }
      await loadExerciseScore(exercise);
      r.gymStore.saveExercise(exercise);
      onClose();
      r.notify('Exercise added to your gym library.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this exercise.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Shape this exercise' : 'Create an exercise'}
      wide
    >
      <form
        className="gym-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="gym-fields">
          <label className="gym-span">
            Name
            <input
              required
              maxLength={100}
              value={draft.title}
              onChange={(e) => change({ title: e.target.value })}
            />
          </label>
          <label>
            Instrument
            <select
              value={draft.instrument}
              onChange={(e) => change({ instrument: e.target.value as Exercise['instrument'] })}
            >
              <option value="guitar">Guitar</option>
              <option value="bass">Bass</option>
            </select>
          </label>
          <label>
            Source
            <select
              value={source.kind}
              onChange={(e) => {
                setSourceScore(null);
                change({
                  source:
                    e.target.value === 'scale'
                      ? { ...starterExercises[0].source, key: source.key }
                      : e.target.value === 'notes'
                        ? { kind: 'notes', key: source.key, notes: 'C3 D3 E3 G3 E3 D3 C3 R' }
                        : {
                            kind: 'score',
                            key: source.key,
                            snapshotId: '',
                            track: 0,
                            startBar: 1,
                            endBar: 1,
                          },
                });
              }}
            >
              <option value="scale">Scale / arpeggio</option>
              <option value="notes">Write notes</option>
              <option value="score">Upload / existing music</option>
            </select>
          </label>
          <label>
            Root key
            <select
              value={source.key}
              onChange={(e) => changeSource({ key: Number(e.target.value) })}
            >
              {keyNames.map((key, i) => (
                <option key={key} value={i}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          {source.kind === 'scale' && (
            <>
              <label>
                Scale / mode
                <select
                  value={source.scaleId}
                  onChange={(e) => changeSource({ scaleId: e.target.value })}
                >
                  {[...new Set(scales.map((s) => s.family))].map((family) => (
                    <optgroup key={family} label={family}>
                      {scales
                        .filter((s) => s.family === family)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label>
                Octaves
                <select
                  value={source.octaves}
                  onChange={(e) => changeSource({ octaves: Number(e.target.value) as 1 })}
                >
                  {[0.5, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      {n === 0.5 ? '½ octave' : `${n} octave${n === 1 ? '' : 's'}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Direction
                <select
                  value={source.direction}
                  onChange={(e) => changeSource({ direction: e.target.value as 'ascending' })}
                >
                  <option value="ascending">Ascending</option>
                  <option value="descending">Descending</option>
                  <option value="up-down">Up and down</option>
                  <option value="down-up">Down and up</option>
                </select>
              </label>
              <label>
                Note pattern
                <select
                  value={source.pattern}
                  onChange={(e) => changeSource({ pattern: e.target.value as 'straight' })}
                >
                  {Object.entries(patternLabels).map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {source.kind === 'notes' && (
            <label className="gym-span">
              Notes
              <textarea
                rows={3}
                value={source.notes}
                onChange={(e) => changeSource({ notes: e.target.value })}
              />
              <small>
                Use pitches such as C3 F#3 Bb2, separated by spaces. R is a rest. Up to 256 notes.
                Root key labels the phrase; pitches are entered literally.
              </small>
            </label>
          )}
          {source.kind === 'score' && (
            <div className="gym-span gym-source">
              <label>
                Upload a score
                <input
                  type="file"
                  accept=".gp,.gp3,.gp4,.gp5,.gpx,.musicxml,.xml,.mxl"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
              </label>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => useScore(r.library.score)}
              >
                Use open music: {r.library.piece.title}
              </button>
              {sourceScore && (
                <label>
                  Part
                  <select
                    value={source.track}
                    onChange={(e) => changeSource({ track: Number(e.target.value) })}
                  >
                    {sourceScore.tracks.map((t) => (
                      <option key={t.index} value={t.index}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="gym-fields">
                <label>
                  First bar
                  <input
                    type="number"
                    min={1}
                    max={sourceScore?.masterBars.length ?? 2000}
                    value={source.startBar}
                    onChange={(e) => changeSource({ startBar: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Last bar
                  <input
                    type="number"
                    min={source.startBar}
                    max={sourceScore?.masterBars.length ?? 2000}
                    value={source.endBar}
                    onChange={(e) => changeSource({ endBar: Number(e.target.value) })}
                  />
                </label>
              </div>
              <small>
                Copies the selected part’s first voice, pitches and rhythms into an independent
                exercise, up to 64 bars. Chords can play back but are not scored. Expressive guitar
                effects are simplified.
              </small>
            </div>
          )}
          <label>
            Starting BPM
            <input
              type="number"
              min={30}
              max={240}
              value={draft.defaults.tempo}
              onChange={(e) =>
                change({ defaults: { ...draft.defaults, tempo: Number(e.target.value) } })
              }
            />
          </label>
          <label>
            Rhythm
            <select
              value={draft.defaults.rhythm}
              onChange={(e) =>
                change({ defaults: { ...draft.defaults, rhythm: e.target.value as 'eighths' } })
              }
            >
              {Object.entries(rhythmLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Articulation
            <select
              value={draft.defaults.articulation}
              onChange={(e) =>
                change({ defaults: { ...draft.defaults, articulation: e.target.value as 'even' } })
              }
            >
              {Object.entries(articulationLabels).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="gym-span">
            Practice notes
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => change({ description: e.target.value })}
            />
          </label>
        </div>
        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={busy}>
            {busy ? 'Preparing exercise…' : 'Save exercise'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
