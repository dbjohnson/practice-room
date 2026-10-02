import { useMemo } from 'react';
import { useRoom } from '../../app/RoomContext';
import { useGymLibrary } from '../../app/useGymLibrary';
import { routineLibraryRows } from '../../domain/gymLibrary';
import type { GymRoutine } from '../../domain/gym';
import { LibraryControls, LibraryPagination, SortHeading } from './LibraryControls';
import { LibraryRowMenu } from './LibraryRowMenu';
export function RoutineLibrary({
  onEdit,
  onDelete,
}: {
  onEdit: (routine?: GymRoutine) => void;
  onDelete: (routine: GymRoutine) => void;
}) {
  const r = useRoom();
  const rows = useMemo(
    () => routineLibraryRows(r.gymStore.routines, r.gymStore.exercises),
    [r.gymStore.routines, r.gymStore.exercises],
  );
  const list = useGymLibrary('routines', rows);
  return (
    <section aria-label="Routine library" className="gym-library">
      <LibraryControls kind="routines" list={list} onCreate={() => onEdit()} />
      <div
        className="gym-library-table-scroll"
        role="region"
        aria-label="Routine list, scroll for more columns"
        tabIndex={0}
      >
        <table className="gym-library-table gym-routine-table" aria-label="Routines">
          <thead>
            <tr>
              <SortHeading label="Name" field="name" list={list} />
              <SortHeading label="Instrument" field="instrument" list={list} />
              <SortHeading label="Blocks" field="blocks" list={list} />
              <SortHeading label="Sets" field="sets" list={list} />
              <SortHeading label="BPM" field="tempo" list={list} />
              <SortHeading label="Updated" field="updated" list={list} />
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.visible.map((row) => {
              const routine = row.item;
              return (
                <tr key={routine.id}>
                  <th scope="row">
                    <div className="gym-library-name">
                      <div>
                        <button
                          className="gym-name-button"
                          onClick={() => onEdit(routine)}
                          title={routine.title}
                        >
                          {routine.title}
                        </button>
                        <span title={routine.description}>
                          {routine.builtin ? 'Starter' : 'Mine'}
                          {routine.description ? ` · ${routine.description}` : ''}
                        </span>
                      </div>
                    </div>
                  </th>
                  <td className="gym-library-instrument">{row.instrument}</td>
                  <td className="gym-library-number">{row.blocks}</td>
                  <td className="gym-library-number">
                    {row.error ? (
                      <span className="danger-text" title={row.error}>
                        Needs repair
                      </span>
                    ) : (
                      row.sets
                    )}
                  </td>
                  <td>{row.tempoLabel}</td>
                  <td>
                    <time dateTime={routine.builtin ? undefined : routine.updatedAt}>
                      {row.updated
                        ? new Date(row.updated).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </time>
                  </td>
                  <td>
                    <div className="gym-library-row-actions">
                      <button
                        className="button button-primary"
                        disabled={!!row.error || r.gym.loading}
                        onClick={() => void r.gym.start(routine)}
                      >
                        Start routine
                      </button>
                      <LibraryRowMenu
                        title={routine.title}
                        builtin={!!routine.builtin}
                        onEdit={() => onEdit(routine)}
                        onCopy={() =>
                          r.gymStore.saveRoutine({
                            ...structuredClone(routine),
                            id: crypto.randomUUID(),
                            title: `${routine.title} · copy`,
                            builtin: false,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                          })
                        }
                        onDelete={() => onDelete(routine)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.count && (
          <div className="gym-library-empty">
            <p>
              {list.total
                ? 'No routines match these filters.'
                : 'Create a routine to assemble exercises into a practice sequence.'}
            </p>
            <button
              className="button button-quiet"
              onClick={list.total ? list.clear : () => onEdit()}
            >
              {list.total ? 'Show all routines' : 'Create your first routine'}
            </button>
          </div>
        )}
      </div>
      <LibraryPagination list={list} kind="routines" />
    </section>
  );
}
