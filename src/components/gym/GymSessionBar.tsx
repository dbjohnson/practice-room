import { useRoom } from '../../app/RoomContext';
import { articulationLabels, rhythmLabels } from '../../domain/gym';
import { setKey } from '../../domain/gymPlan';
import { keyNames } from '../../music/transposeScore';
export function GymSessionBar() {
  const r = useRoom(),
    run = r.gym.run;
  if (!run) return null;
  const set = run.queue[run.index];
  const locked = r.gym.loading || r.takes.recording || r.takes.audio.processing;
  return (
    <aside className="gym-session" aria-label="Current workout">
      <div>
        <span className="eyebrow">
          {run.status === 'completed'
            ? 'WORKOUT COMPLETE'
            : `${run.title} · SET ${run.index + 1} OF ${run.queue.length}`}
        </span>
        <strong>
          {run.status === 'completed'
            ? `${run.completedSets.length} completed · ${run.skippedSets.length} skipped`
            : `${set.exercise.title} · ${keyNames[setKey(set)]} · ${set.tempo} BPM`}
        </strong>
        {run.status !== 'completed' && (
          <small>
            {set.routinePass && `Pass ${set.routinePass.number} of ${set.routinePass.total} · `}
            {rhythmLabels[set.rhythm]} · {articulationLabels[set.articulation]} · target{' '}
            {set.target}%{r.gym.rest > 0 ? ` · Rest ${r.gym.rest}s` : ''}
          </small>
        )}
      </div>
      <progress
        aria-label="Workout progress"
        value={run.status === 'completed' ? run.queue.length : run.index}
        max={run.queue.length}
      />
      <div className="gym-actions">
        {run.status === 'completed' ? (
          <>
            <button
              className="button button-primary"
              onClick={() => {
                r.setGymView('progress');
                r.setPage('gym');
              }}
            >
              See progress
            </button>
            <button className="button button-quiet" onClick={r.gym.close}>
              Done
            </button>
          </>
        ) : run.status === 'paused' || !r.gymRunMatches ? (
          <button
            className="button button-primary"
            disabled={locked}
            onClick={() => void r.gym.resume()}
          >
            Resume workout
          </button>
        ) : (
          <>
            {r.gym.rest > 0 && (
              <button className="button button-quiet" onClick={r.gym.skipRest}>
                Skip rest
              </button>
            )}
            <button
              className="button button-quiet"
              disabled={locked}
              onClick={() => void r.gym.retry()}
            >
              Retry set
            </button>
            <button className="button button-quiet" disabled={locked} onClick={r.gym.pause}>
              Pause workout
            </button>
            <button
              className="button button-quiet"
              disabled={locked}
              onClick={() => void r.gym.advance(true)}
            >
              Skip set
            </button>
            <button
              className="button button-primary"
              disabled={locked || !r.gym.canAdvance}
              onClick={() => void r.gym.advance()}
            >
              Next set
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
