import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { useRoom } from '../../app/RoomContext';
import { useGymLibrary } from '../../app/useGymLibrary';
import { exerciseLibraryRows } from '../../domain/gymLibrary';
import type { Exercise } from '../../domain/gym';
import { keyNames } from '../../music/transposeScore';
import { LibraryControls, LibraryPagination, SortHeading } from './LibraryControls';
import { LibraryRowMenu } from './LibraryRowMenu';
export function ExerciseLibrary({
  onEdit,
  onTransform,
  onDelete,
  onPractice,
  onCopy,
}: {
  onEdit: (exercise?: Exercise) => void;
  onTransform: (exercise: Exercise) => void;
  onDelete: (exercise: Exercise) => void;
  onPractice: (exercise: Exercise) => void;
  onCopy: (exercise: Exercise, favorite?: boolean) => void;
}) {
  const r = useRoom();
  const rows = useMemo(() => exerciseLibraryRows(r.gymStore.exercises), [r.gymStore.exercises]);
  const list = useGymLibrary('exercises', rows);
  return (
    <section aria-label="Exercise library" className="gym-library">
      <LibraryControls kind="exercises" list={list} onCreate={() => onEdit()} />
      <div
        className="gym-library-table-scroll"
        role="region"
        aria-label="Exercise list, scroll for more columns"
        tabIndex={0}
      >
        <table className="gym-library-table" aria-label="Exercises">
          <thead>
            <tr>
              <SortHeading label="Name" field="name" list={list} />
              <SortHeading label="Instrument" field="instrument" list={list} />
              <SortHeading label="Type" field="kind" list={list} />
              <SortHeading label="Key" field="key" list={list} />
              <th scope="col">Range</th>
              <SortHeading label="BPM" field="tempo" list={list} />
              <SortHeading label="Updated" field="updated" list={list} />
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.visible.map((row) => {
              const e = row.item;
              return (
                <tr key={e.id}>
                  <th scope="row">
                    <div className="gym-library-name">
                      <button
                        className="icon-button"
                        aria-label={`${e.favorite ? 'Unfavorite' : 'Favorite'} ${e.title}`}
                        aria-pressed={!!e.favorite}
                        onClick={() =>
                          e.builtin
                            ? onCopy(e, true)
                            : r.gymStore.saveExercise({ ...e, favorite: !e.favorite })
                        }
                      >
                        <Star size={15} fill={e.favorite ? 'currentColor' : 'none'} />
                      </button>
                      <div>
                        <button
                          className="gym-name-button"
                          onClick={() => onEdit(e)}
                          title={e.title}
                        >
                          {e.title}
                        </button>
                        <span title={e.description}>
                          {e.builtin ? 'Starter' : 'Mine'}
                          {e.description ? ` · ${e.description}` : ''}
                        </span>
                      </div>
                    </div>
                  </th>
                  <td className="gym-library-instrument">{row.instrument}</td>
                  <td>{row.kindLabel}</td>
                  <td>{keyNames[row.key]}</td>
                  <td>{row.range}</td>
                  <td className="gym-library-number">{row.tempo}</td>
                  <td>
                    <time dateTime={e.builtin ? undefined : e.updatedAt}>
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
                        disabled={r.gym.loading}
                        onClick={() => onPractice(e)}
                      >
                        Practice
                      </button>
                      <button className="button button-quiet" onClick={() => onTransform(e)}>
                        Transform
                      </button>
                      <LibraryRowMenu
                        title={e.title}
                        builtin={!!e.builtin}
                        onEdit={() => onEdit(e)}
                        onCopy={() => onCopy(e)}
                        onDelete={() => onDelete(e)}
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
            <p>No exercises match these filters.</p>
            <button className="button button-quiet" onClick={list.clear}>
              Show all exercises
            </button>
          </div>
        )}
      </div>
      <LibraryPagination list={list} kind="exercises" />
    </section>
  );
}
