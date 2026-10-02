import { useState } from 'react';
import { Award, Flame, Trophy } from 'lucide-react';
import { useRoom } from '../../app/RoomContext';
import { gymRewards } from '../../domain/gymRewards';
import { keyNames } from '../../music/transposeScore';
export function GymProgress() {
  const r = useRoom(),
    data = r.gymStore.data,
    rewards = gymRewards(data);
  const [filter, setFilter] = useState('all');
  const attempts = data.attempts
    .filter((a) => filter === 'all' || a.exerciseId === filter)
    .slice(-40);
  const exerciseNames = [...new Map(data.attempts.map((a) => [a.exerciseId, a.title])).entries()];
  const x = (i: number) => 36 + (i * 628) / Math.max(1, attempts.length - 1);
  const y = (value: number) => 160 - value * 1.3;
  return (
    <div className="gym-progress">
      <div className="gym-stat-grid">
        <div>
          <Trophy size={20} />
          <strong>Level {rewards.level}</strong>
          <span>
            {rewards.xp} XP · {rewards.nextLevelXp - rewards.xp} to next level
          </span>
          <progress
            value={rewards.xp - rewards.levelStartXp}
            max={rewards.nextLevelXp - rewards.levelStartXp}
          />
        </div>
        <div>
          <Flame size={20} />
          <strong>
            {rewards.streak} day{rewards.streak === 1 ? '' : 's'}
          </strong>
          <span>Current streak · best {rewards.longest}</span>
        </div>
        <div>
          <strong>{Math.floor(rewards.seconds / 60)} min</strong>
          <span>Total active practice · {data.attempts.length} takes</span>
        </div>
        <div>
          <strong>
            {Math.floor(rewards.todaySeconds / 60)} / {data.dailyGoalMinutes} min
          </strong>
          <span>Today’s practice goal</span>
          <progress value={rewards.todaySeconds} max={data.dailyGoalMinutes * 60} />
          <label>
            Daily goal
            <select
              value={data.dailyGoalMinutes}
              onChange={(e) =>
                r.gymStore.commit((d) => ({ ...d, dailyGoalMinutes: Number(e.target.value) }))
              }
            >
              {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <section className="gym-panel">
        <div className="gym-block-head">
          <h2>Your practice over time</h2>
          <label>
            Exercise
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All exercises</option>
              {exerciseNames.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!attempts.length ? (
          <p>
            Record a gym take to start your history. You’ll see notes, timing, tempo, and
            clean-speed records here.
          </p>
        ) : (
          <>
            <div className="gym-chart-legend">
              <span className="gym-notes">● Notes</span>
              <span className="gym-timing">● Timing</span>
              <span>Latest {attempts.length} takes, oldest to newest</span>
            </div>
            <svg
              className="gym-chart"
              viewBox="0 0 700 190"
              role="img"
              aria-label="Notes and timing scores over the latest takes. Exact scores and tempos are in the table below."
            >
              {[0, 50, 95, 100].map((v) => (
                <g key={v}>
                  <line x1={32} x2={672} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".15" />
                  <text x={2} y={y(v) + 4} fill="currentColor" fontSize="11">
                    {v}
                  </text>
                </g>
              ))}
              {(['notes', 'timing'] as const).map((metric) => (
                <g className={`gym-${metric}`} key={metric}>
                  {attempts.map((a, i) =>
                    a[metric] === null ? null : (
                      <g key={a.id}>
                        {i > 0 && attempts[i - 1][metric] !== null && (
                          <line
                            x1={x(i - 1)}
                            x2={x(i)}
                            y1={y(attempts[i - 1][metric]!)}
                            y2={y(a[metric]!)}
                            stroke="currentColor"
                            strokeWidth={2}
                          />
                        )}
                        <circle cx={x(i)} cy={y(a[metric]!)} r={4} fill="currentColor">
                          <title>
                            {new Date(a.createdAt).toLocaleString()} · {a.title} · {a.tempo} BPM ·{' '}
                            {metric} {a[metric]}%
                          </title>
                        </circle>
                      </g>
                    ),
                  )}
                </g>
              ))}
            </svg>
            <div className="gym-table-scroll">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Take</th>
                    <th>Exercise</th>
                    <th>Key / BPM</th>
                    <th>Notes</th>
                    <th>Timing</th>
                    <th>Score</th>
                    <th>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {[...attempts].reverse().map((a) => (
                    <tr key={a.id}>
                      <td>
                        {r.takes.takes.some((t) => t.id === a.id) ? (
                          <button
                            className="text-button"
                            onClick={() =>
                              r.takes.setReview(r.takes.takes.find((t) => t.id === a.id)!)
                            }
                          >
                            {new Date(a.createdAt).toLocaleDateString()}
                          </button>
                        ) : (
                          new Date(a.createdAt).toLocaleDateString()
                        )}
                        {a.interrupted && <small> · stopped early</small>}
                      </td>
                      <td>{a.title}</td>
                      <td>
                        {keyNames[a.key]} / {a.tempo}
                      </td>
                      <td>
                        {a.notes ?? '—'}
                        {a.notes !== null && '%'}
                      </td>
                      <td>
                        {a.timing ?? '—'}
                        {a.timing !== null && '%'}
                      </td>
                      <td>
                        {a.score ?? '—'}
                        {a.score !== null && '%'}
                      </td>
                      <td>{a.coverage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section className="gym-panel">
        <h2>Clean-speed records</h2>
        <p>
          Complete takes with 95%+ notes, 95%+ timing and at least 90% coverage. Records compare the
          same exercise version, key, rhythm and articulation.
        </p>
        {rewards.records.length ? (
          <div className="gym-card-grid">
            {rewards.records.map((a) => (
              <div className="gym-record" key={a.profile}>
                <Trophy size={20} />
                <strong>{a.tempo} BPM</strong>
                <span>
                  {a.title} · {keyNames[a.key]} · {a.rhythm} · {a.articulation}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-copy">
            Your first clean take establishes a record. Beat its tempo to earn a new milestone.
          </p>
        )}
      </section>
      <section>
        <h2>Earn your badges</h2>
        <div className="gym-badge-grid">
          {rewards.badges.map((badge) => (
            <div
              key={badge.id}
              className={`gym-badge ${badge.value >= badge.target ? 'earned' : ''}`}
            >
              <Award size={26} />
              <strong>{badge.title}</strong>
              <p>{badge.description}</p>
              <progress value={Math.min(badge.value, badge.target)} max={badge.target} />
              <small>
                {badge.value >= badge.target ? 'Earned' : `${badge.value} / ${badge.target}`}
              </small>
            </div>
          ))}
        </div>
      </section>
      <details className="gym-panel">
        <summary>How progress is earned</summary>
        <p>
          Active play-along and recording time earns 10 XP per minute. Takes of at least five
          seconds earn 5 XP; qualifying clean takes earn 10 extra; a new clean-speed record earns
          25; completing every set in a workout earns 30. Listening, replays, rests, and example
          feedback earn none. A streak day needs at least one minute of active practice.
        </p>
        <p>
          Articulation markings guide your playing; the current single-note analyser scores pitch
          and timing. All gym results stay in this browser, including unclear or interrupted
          attempts. Those attempts cannot earn clean-speed records. Detailed audio history retains
          the most recent 200 saved takes; the gym’s compact progress history is separate.
        </p>
      </details>
    </div>
  );
}
