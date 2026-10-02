import { useRoom } from '../../app/RoomContext';
import type { Take } from '../../domain/types';
import { cleanAttempt, gymRewards, isPersonalBest } from '../../domain/gymRewards';
export function GymReview({ take }: { take: Take }) {
  const r = useRoom();
  if (!take.gym) return null;
  const attempt = r.gymStore.data.attempts.find((a) => a.id === take.id);
  const rewards = gymRewards(r.gymStore.data);
  const run = r.gym.run;
  const current =
    run?.status === 'active' &&
    take.gym.runId === run.id &&
    take.gym.set.id === run.queue[run.index].id;
  return (
    <section className="gym-review" aria-label="Gym take result">
      <strong>
        {!attempt
          ? 'Finishing your gym take…'
          : isPersonalBest(attempt, r.gymStore.data.attempts)
            ? `New clean-speed record! ${attempt.tempo} BPM`
            : cleanAttempt(attempt)
              ? `Clean take at ${attempt.tempo} BPM`
              : 'Another rep in the bank'}
      </strong>
      <p>
        {attempt
          ? `${r.gymStore.error ? 'Result kept for this session' : 'Result saved automatically'} · ${rewards.xp} total XP · Level ${rewards.level}`
          : 'Notes and timing will be added to your practice history.'}
      </p>
      {attempt && (
        <p>
          <strong>+{attempt.earnedXp ?? 0} XP</strong>
          {attempt.earnedBadges?.length
            ? ` · New badges: ${rewards.badges
                .filter((b) => attempt.earnedBadges!.includes(b.id))
                .map((b) => b.title)
                .join(', ')}`
            : ''}
        </p>
      )}
      {current && (
        <div className="gym-actions">
          <button
            className="button button-quiet"
            disabled={!attempt}
            onClick={() => {
              r.takes.setReview(null);
              void r.gym.retry();
            }}
          >
            Retry set
          </button>
          <button
            className="button button-primary"
            disabled={!attempt || !r.gym.canAdvance}
            onClick={() => {
              r.takes.setReview(null);
              void r.gym.advance();
            }}
          >
            {run.index === run.queue.length - 1 ? 'Finish workout' : 'Next set'}
          </button>
          <button
            className="button button-quiet"
            disabled={!attempt}
            onClick={() => {
              r.takes.setReview(null);
              void r.gym.advance(true);
            }}
          >
            Skip set
          </button>
        </div>
      )}
      {current && attempt && !r.gym.canAdvance && (
        <small>
          {take.gym.set.requirePass
            ? `Reach ${take.gym.set.target}% notes and timing with 90% coverage to advance, or skip.`
            : 'Complete the full set to advance, or skip.'}
        </small>
      )}
    </section>
  );
}
