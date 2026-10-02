import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { defaultTransform, type Exercise, type GymRoutine, type GymView } from '../domain/gym';
import { gymRewards } from '../domain/gymRewards';
import { ExerciseEditor } from '../components/gym/ExerciseEditor';
import { RoutineEditor } from '../components/gym/RoutineEditor';
import { GymProgress } from '../components/gym/GymProgress';
import { GymSessionBar } from '../components/gym/GymSessionBar';
import { ExerciseLibrary } from '../components/gym/ExerciseLibrary';
import { RoutineLibrary } from '../components/gym/RoutineLibrary';
import { Modal } from '../components/Modal';
export function GymPage() {
  const r = useRoom(),
    store = r.gymStore,
    rewards = gymRewards(store.data);
  const [editor, setEditor] = useState<{ exercise?: Exercise } | null>(null);
  const [routineEditor, setRoutineEditor] = useState<{
    initial?: GymRoutine;
    exercise?: Exercise;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    id: string;
    title: string;
    kind: 'exercise' | 'routine';
  } | null>(null);
  const startExercise = (exercise: Exercise) =>
    void r.gym.start({
      id: `solo-${exercise.id}`,
      title: exercise.title,
      description: '',
      createdAt: '',
      updatedAt: '',
      blocks: [
        {
          id: 'solo',
          exerciseId: exercise.id,
          transform: { ...defaultTransform(exercise.defaults.tempo), restSeconds: 0 },
        },
      ],
    });
  const copyExercise = (e: Exercise, favorite = false) =>
    store.saveExercise({
      ...structuredClone(e),
      id: crypto.randomUUID(),
      builtin: false,
      title: `${e.title} · my copy`,
      favorite,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  return (
    <div className="gym-page">
      <header className={`gym-heading ${r.gymView !== 'progress' ? 'gym-library-heading' : ''}`}>
        <div>
          <div className="eyebrow">
            <Dumbbell size={16} /> PRACTICE GYM
          </div>
          <h1>{r.gymView === 'progress' ? 'A little stronger, every session.' : 'Practice gym'}</h1>
          <p>
            {r.gymView === 'progress'
              ? 'Build your exercises. Find your rhythm. Beat your own best.'
              : 'Find an exercise or build your next routine.'}
          </p>
        </div>
        <button className="gym-level" onClick={() => r.setGymView('progress')}>
          <strong>Level {rewards.level}</strong>
          <span>
            {rewards.xp} XP · {rewards.streak}-day streak
          </span>
        </button>
      </header>
      <div className="gym-tabs segmented" role="group" aria-label="Gym section">
        {(['exercises', 'routines', 'progress'] as GymView[]).map((view) => (
          <button
            key={view}
            className={r.gymView === view ? 'active' : ''}
            aria-pressed={r.gymView === view}
            onClick={() => r.setGymView(view)}
          >
            {view === 'exercises'
              ? 'Exercise library'
              : view === 'routines'
                ? 'Practice routines'
                : 'Progress & rewards'}
          </button>
        ))}
      </div>
      {store.error && (
        <p className="notice" role="alert">
          {store.error}{' '}
          <button className="text-button" onClick={store.retrySave}>
            Retry saving
          </button>
        </p>
      )}
      {!store.ready ? (
        <p role="status">Opening your gym…</p>
      ) : (
        <>
          <GymSessionBar />
          {r.gymView === 'progress' ? (
            <GymProgress />
          ) : r.gymView === 'exercises' ? (
            <ExerciseLibrary
              onEdit={(exercise) => setEditor({ exercise })}
              onTransform={(exercise) => setRoutineEditor({ exercise })}
              onDelete={(exercise) =>
                setDeleting({ id: exercise.id, title: exercise.title, kind: 'exercise' })
              }
              onPractice={startExercise}
              onCopy={copyExercise}
            />
          ) : (
            <RoutineLibrary
              onEdit={(initial) => setRoutineEditor({ initial })}
              onDelete={(routine) =>
                setDeleting({ id: routine.id, title: routine.title, kind: 'routine' })
              }
            />
          )}
        </>
      )}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.kind ?? 'item'}?`}
      >
        <p>Delete “{deleting?.title}”? Your practice history stays.</p>
        <div className="modal-actions">
          <button className="button button-quiet" onClick={() => setDeleting(null)}>
            Cancel
          </button>
          <button
            className="button button-danger"
            onClick={() => {
              if (!deleting) return;
              if (deleting.kind === 'exercise') store.removeExercise(deleting.id);
              else store.removeRoutine(deleting.id);
              setDeleting(null);
            }}
          >
            Delete {deleting?.kind}
          </button>
        </div>
      </Modal>
      {editor && <ExerciseEditor initial={editor.exercise} onClose={() => setEditor(null)} />}
      {routineEditor && <RoutineEditor {...routineEditor} onClose={() => setRoutineEditor(null)} />}
    </div>
  );
}
