import type { GymAttempt, GymData, GymSet } from './gym';
import type { Take } from './types';
import { comparisonProfile, setKey } from './gymPlan';

export function gymAttempt(take: Take): GymAttempt | null {
  if (!take.gym || take.origin !== 'microphone') return null;
  const { set, runId } = take.gym;
  return {
    id: take.id,
    runId,
    setId: set.id,
    exerciseId: set.exercise.id,
    title: set.exercise.title,
    revision: set.exercise.revision,
    profile:
      take.rubric === 'mono-v3' ? `${comparisonProfile(set)}:mono-v3` : comparisonProfile(set),
    scaleId: set.exercise.source.kind === 'scale' ? set.exercise.source.scaleId : undefined,
    key: setKey(set),
    tempo: take.tempo,
    rhythm: set.rhythm,
    articulation: set.articulation,
    createdAt: take.createdAt,
    seconds: Math.min(
      7200,
      Math.max(0, take.duration),
      ((take.range.end - take.range.start + 1) * 4 * 60) / take.tempo,
    ),
    notes: take.pitchAccuracy,
    timing: take.timingScore ?? null,
    score: take.overallScore ?? null,
    coverage: take.coverage,
    timingCoverage: take.timingCoverage ?? take.coverage,
    interrupted: !!take.interrupted,
  };
}
export const passesSet = (a: GymAttempt, set: GymSet) =>
  !a.interrupted &&
  a.coverage >= 90 &&
  (a.timingCoverage ?? a.coverage) >= 90 &&
  (a.notes ?? 0) >= set.target &&
  (a.timing ?? 0) >= set.target;
export const cleanAttempt = (a: GymAttempt) =>
  a.seconds > 0 &&
  !a.interrupted &&
  a.coverage >= 90 &&
  (a.timingCoverage ?? a.coverage) >= 90 &&
  (a.notes ?? 0) >= 95 &&
  (a.timing ?? 0) >= 95;
export function isPersonalBest(attempt: GymAttempt, attempts: GymAttempt[]) {
  if (!cleanAttempt(attempt)) return false;
  const earlier = attempts.filter(
    (a) =>
      a.id !== attempt.id &&
      a.profile === attempt.profile &&
      a.createdAt < attempt.createdAt &&
      cleanAttempt(a),
  );
  return earlier.length > 0 && attempt.tempo > Math.max(...earlier.map((a) => a.tempo));
}
export const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export interface GymBadge {
  id: string;
  title: string;
  description: string;
  value: number;
  target: number;
}
export function gymRewards(data: GymData, now = new Date()) {
  const attempts = [...new Map(data.attempts.map((a) => [a.id, a])).values()];
  const activities = [...new Map(data.activities.map((a) => [a.id, a])).values()];
  const days = new Map<string, number>();
  for (const a of activities) {
    const day = dayKey(new Date(a.createdAt));
    days.set(day, (days.get(day) ?? 0) + a.seconds);
  }
  const seconds = activities.reduce((total, a) => total + a.seconds, 0);
  let streak = 0;
  const cursor = new Date(now);
  if ((days.get(dayKey(cursor)) ?? 0) < 60) cursor.setDate(cursor.getDate() - 1);
  while ((days.get(dayKey(cursor)) ?? 0) >= 60) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const clean = attempts.filter(cleanAttempt);
  const records = new Map<string, GymAttempt>(),
    bests: GymAttempt[] = [];
  const ordered = [...clean].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].createdAt === ordered[start].createdAt) end++;
    const group = ordered.slice(start, end);
    for (const a of group) {
      const previous = records.get(a.profile);
      if (previous && a.tempo > previous.tempo) bests.push(a);
    }
    for (const a of group)
      if ((records.get(a.profile)?.tempo ?? 0) < a.tempo) records.set(a.profile, a);
    start = end;
  }
  const completed = [...new Map(data.completedRuns.map((r) => [r.id, r])).values()].filter(
    (r) => r.completed === r.sets,
  );
  const xp =
    Math.floor(seconds / 6) +
    attempts.filter((a) => a.seconds >= 5).length * 5 +
    clean.length * 10 +
    bests.length * 25 +
    completed.length * 30;
  const level = 1 + Math.floor(Math.sqrt(xp / 100));
  const badges: GymBadge[] = [
    {
      id: 'first',
      title: 'First rep',
      description: 'Record your first take.',
      value: attempts.filter((a) => a.seconds > 0).length,
      target: 1,
    },
    {
      id: 'ten',
      title: 'Showing up',
      description: 'Record 10 takes.',
      value: attempts.filter((a) => a.seconds > 0).length,
      target: 10,
    },
    {
      id: 'creator',
      title: 'Your own path',
      description: 'Create an exercise.',
      value: data.exercises.length,
      target: 1,
    },
    {
      id: 'routine',
      title: 'Full circuit',
      description: 'Finish every set in a workout.',
      value: completed.length,
      target: 1,
    },
    {
      id: 'minutes',
      title: 'Finding your feet',
      description: 'Practice for 10 minutes.',
      value: Math.floor(seconds / 60),
      target: 10,
    },
    {
      id: 'hour',
      title: 'An hour well spent',
      description: 'Practice for an hour.',
      value: Math.floor(seconds / 60),
      target: 60,
    },
    {
      id: 'five-hours',
      title: 'Putting in the work',
      description: 'Practice for five hours.',
      value: Math.floor(seconds / 60),
      target: 300,
    },
    {
      id: 'clean',
      title: 'Clean take',
      description: '95%+ notes and timing, at least 90% coverage.',
      value: clean.length,
      target: 1,
    },
    {
      id: 'speed',
      title: 'A new gear',
      description: 'Beat a previous clean-speed record.',
      value: bests.length,
      target: 1,
    },
    {
      id: 'keys',
      title: 'Around the circle',
      description: 'Complete scored takes in all 12 keys.',
      value: new Set(attempts.filter((a) => !a.interrupted && a.score !== null).map((a) => a.key))
        .size,
      target: 12,
    },
    {
      id: 'modes',
      title: 'Modal explorer',
      description: 'Complete scored takes with seven different scales or modes.',
      value: new Set(
        attempts
          .filter((a) => !a.interrupted && a.score !== null && a.scaleId)
          .map((a) => a.scaleId),
      ).size,
      target: 7,
    },
  ];
  // Streak badges remain earned after a break: find the longest recorded streak.
  let longest = 0,
    chain = 0,
    previous: Date | null = null;
  for (const key of [...days.keys()].filter((k) => days.get(k)! >= 60).sort()) {
    const date = new Date(`${key}T12:00:00`);
    const expected = previous && new Date(previous);
    expected?.setDate(expected.getDate() + 1);
    chain = expected && dayKey(expected) === key ? chain + 1 : 1;
    longest = Math.max(longest, chain);
    previous = date;
  }
  badges.push(
    {
      id: 'streak3',
      title: 'Three-day rhythm',
      description: 'Practice at least a minute on three consecutive days.',
      value: longest,
      target: 3,
    },
    {
      id: 'streak7',
      title: 'In the habit',
      description: 'Practice at least a minute on seven consecutive days.',
      value: longest,
      target: 7,
    },
  );
  for (const badge of badges)
    if (data.earnedBadges?.[badge.id]) badge.value = Math.max(badge.value, badge.target);
  return {
    xp,
    level,
    nextLevelXp: 100 * level * level,
    levelStartXp: 100 * (level - 1) ** 2,
    seconds,
    todaySeconds: days.get(dayKey(now)) ?? 0,
    streak,
    longest,
    badges,
    records: [...records.values()],
    bests,
    days,
  };
}
