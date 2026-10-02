import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-react';
import { useRoom } from '../../app/RoomContext';
import { defaultTransform, type Exercise, type GymRoutine } from '../../domain/gym';
import { expandRoutine, setKey } from '../../domain/gymPlan';
import { keyNames } from '../../music/transposeScore';
import { Modal } from '../Modal';
import { TransformFields } from './TransformFields';
import { RoutineLoopFields } from './RoutineLoopFields';
export function RoutineEditor({
  initial,
  exercise,
  onClose,
}: {
  initial?: GymRoutine;
  exercise?: Exercise;
  onClose: () => void;
}) {
  const r = useRoom();
  const [draft, setDraft] = useState<GymRoutine>(() =>
    initial
      ? {
          ...structuredClone(initial),
          id: initial.builtin ? crypto.randomUUID() : initial.id,
          builtin: false,
          title: initial.title + (initial.builtin ? ' · my version' : ''),
        }
      : {
          id: crypto.randomUUID(),
          title: exercise ? `${exercise.title} workout` : 'My practice routine',
          description: '',
          blocks: exercise
            ? [
                {
                  id: crypto.randomUUID(),
                  exerciseId: exercise.id,
                  transform: defaultTransform(exercise.defaults.tempo),
                },
              ]
            : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
  );
  const [selected, setSelected] = useState(exercise?.id ?? r.gymStore.exercises[0].id);
  const [error, setError] = useState('');
  let preview: ReturnType<typeof expandRoutine> = [],
    previewError = '';
  try {
    preview = expandRoutine(draft, r.gymStore.exercises);
  } catch (e) {
    previewError = e instanceof Error ? e.message : 'Check the routine.';
  }
  const save = (start: boolean) => {
    try {
      if (previewError) throw new Error(previewError);
      const routine = r.gymStore.saveRoutine({ ...draft, updatedAt: new Date().toISOString() });
      onClose();
      if (start) void r.gym.start(routine);
      else r.notify('Routine saved to your gym.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save routine.');
    }
  };
  const move = (index: number, delta: number) => {
    const blocks = [...draft.blocks];
    [blocks[index], blocks[index + delta]] = [blocks[index + delta], blocks[index]];
    setDraft({ ...draft, blocks });
  };
  return (
    <Modal open onClose={onClose} title="Build a practice routine" wide>
      <div className="gym-form">
        <div className="gym-fields">
          <label className="gym-span">
            Routine name
            <input
              maxLength={100}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="gym-span">
            Description
            <textarea
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>
        <RoutineLoopFields
          value={draft.outerLoop}
          tempo={draft.blocks[0]?.transform.startBpm ?? 80}
          onChange={(outerLoop) => setDraft({ ...draft, outerLoop })}
        />
        <div className="gym-add">
          <label>
            Add an exercise
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {r.gymStore.exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {e.instrument}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={draft.blocks.length >= 40}
            onClick={() => {
              const e = r.gymStore.exercises.find((e) => e.id === selected)!;
              setDraft({
                ...draft,
                blocks: [
                  ...draft.blocks,
                  {
                    id: crypto.randomUUID(),
                    exerciseId: e.id,
                    transform: defaultTransform(e.defaults.tempo),
                  },
                ],
              });
            }}
          >
            Add block
          </button>
        </div>
        {draft.blocks.map((block, index) => (
          <section className="gym-block" key={block.id}>
            <div className="gym-block-head">
              <strong>
                {index + 1}.{' '}
                {r.gymStore.exercises.find((e) => e.id === block.exerciseId)?.title ??
                  'Missing exercise'}
              </strong>
              <div className="gym-actions">
                <button
                  className="icon-button"
                  aria-label={`Move block ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move block ${index + 1} down`}
                  disabled={index === draft.blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Duplicate block ${index + 1}`}
                  disabled={draft.blocks.length >= 40}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      blocks: [
                        ...draft.blocks.slice(0, index + 1),
                        { ...structuredClone(block), id: crypto.randomUUID() },
                        ...draft.blocks.slice(index + 1),
                      ],
                    })
                  }
                >
                  <Copy size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove block ${index + 1}`}
                  onClick={() =>
                    setDraft({ ...draft, blocks: draft.blocks.filter((b) => b.id !== block.id) })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <TransformFields
              value={block.transform}
              routineTempo={!!draft.outerLoop?.tempo}
              routineKeys={!!draft.outerLoop?.keys}
              onChange={(transform) =>
                setDraft({
                  ...draft,
                  blocks: draft.blocks.map((b) => (b.id === block.id ? { ...b, transform } : b)),
                })
              }
            />
          </section>
        ))}
        <div className="gym-preview">
          <strong>{preview.length} sets</strong>
          <p>
            {draft.outerLoop?.tempo || draft.outerLoop?.keys
              ? 'Each pass runs every block in order. Complete all keys at a tempo before the next tempo step.'
              : 'Each block moves through tempo steps, then keys, then repetitions.'}{' '}
            Articulations guide practice; scores measure notes and timing.
          </p>
          {previewError ? (
            <p role="status">{previewError}</p>
          ) : (
            <ol>
              {preview.slice(0, 16).map((s) => (
                <li key={s.id}>
                  {s.routinePass && `Pass ${s.routinePass.number} · `}
                  {s.exercise.title} · {keyNames[setKey(s)]} · {s.tempo} BPM · rep {s.repetition}
                </li>
              ))}
            </ol>
          )}
          {preview.length > 16 && <small>And {preview.length - 16} more sets.</small>}
        </div>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button button-dark"
            disabled={!!previewError}
            onClick={() => save(false)}
          >
            Save routine
          </button>
          <button
            className="button button-primary"
            disabled={!!previewError || r.gym.loading}
            onClick={() => save(true)}
          >
            Save & start
          </button>
        </div>
      </div>
    </Modal>
  );
}
