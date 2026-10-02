import type { ExpectedNote, NoteResult, Observation, Take } from '../domain/types';
import { ticksToSeconds } from '../time/timeline';

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function summarize(notes: NoteResult[]) {
  const assessed = notes.filter((note) => note.status !== 'unclear');
  const coverage = notes.length ? Math.round((100 * assessed.length) / notes.length) : 0;
  const pitchAccuracy = assessed.length
    ? Math.round(
        (100 * assessed.filter((note) => note.status === 'matched').length) / assessed.length,
      )
    : null;
  const timed = notes.filter((note) =>
    note.timingStatus ? note.timingStatus !== 'unclear' : note.status !== 'unclear',
  );
  const timingCoverage = notes.length ? Math.round((100 * timed.length) / notes.length) : 0;
  const timingScore = timed.length
    ? Math.round(
        timed.reduce((sum, note) => {
          if (note.delta === null) return sum;
          return sum + Math.max(0, Math.min(100, ((150 - Math.abs(note.delta)) * 100) / 125));
        }, 0) / timed.length,
      )
    : null;
  const deltas = timed.filter((note) => note.delta !== null).map((note) => note.delta!);
  const placement = median(deltas);
  return {
    pitchAccuracy,
    timingScore,
    timingCoverage,
    overallScore:
      coverage >= 60 && timingCoverage >= 60 && pitchAccuracy !== null && timingScore !== null
        ? Math.round((pitchAccuracy + timingScore) / 2)
        : null,
    timingMs: median(deltas.map((delta) => Math.abs(delta))),
    // Where the player sits against the beat, and how consistently.
    placementMs: placement,
    spreadMs: placement === null ? null : median(deltas.map((d) => Math.abs(d - placement))),
    coverage,
  };
}

const MISS_COST = 1;
const EXTRA_COST = 0.2;
const WRONG_PITCH_COST = 0.6;

const isClear = (o: Observation) => o.confidence >= 0.88 && o.midi !== null && o.rms < 0.8;
function pitchClass(o: Observation, midi: number): 'same' | 'octave' | 'other' {
  const distance = Math.abs(o.midi! - midi);
  if (distance < 0.65) return 'same';
  return Math.abs(distance - 12 * Math.round(distance / 12)) < 0.65 ? 'octave' : 'other';
}

/**
 * Pairs each written note with at most one detected attack, in order, choosing the
 * pairing with the lowest total cost. One late note or a stray attack therefore
 * cannot shift every later match.
 */
export function assess(
  expected: ExpectedNote[],
  observations: Observation[],
  bpm: number,
  startTick: number,
  offsetMs = 0,
): NoteResult[] {
  const offset = offsetMs / 1000;
  const targets = expected.map((note) => note.time ?? ticksToSeconds(note.tick - startTick, bpm));
  const heard = [...observations].sort((a, b) => a.time - b.time);
  // Keys struck together arrive in any order; match them low to high like the score.
  for (let start = 0; start < heard.length;) {
    let end = start + 1;
    while (end < heard.length && heard[end].time - heard[start].time <= 0.03) end++;
    if (end - start > 1) {
      const chord = heard.slice(start, end).sort((a, b) => (a.midi ?? 0) - (b.midi ?? 0));
      heard.splice(start, chord.length, ...chord);
    }
    start = end;
  }
  const healthyInput = heard.some((o) => o.rms > 0.012 && isClear(o));
  const reliableTiming = (o: Observation) => o.timingReliable ?? (isClear(o) && o.rms > 0.012);
  const timingInput = heard.some(reliableTiming);
  const n = expected.length;
  const m = heard.length;
  const windows = targets.map((target, i) => {
    // Distance to the nearest note at a different time; chord notes share one.
    let before = i - 1;
    while (before >= 0 && targets[before] >= target) before--;
    let after = i + 1;
    while (after < n && targets[after] <= target) after++;
    const gap = Math.min(
      before >= 0 ? target - targets[before] : Infinity,
      after < n ? targets[after] - target : Infinity,
    );
    return Math.min(0.25, Math.max(0.07, (Number.isFinite(gap) ? gap : 0.5) * 0.5));
  });
  const pairCost = (i: number, j: number) => {
    const distance = Math.abs(heard[j].time - offset - targets[i]);
    if (distance > windows[i]) return Infinity;
    // Ungraded notes (chords, bends) still absorb their own attack.
    const wrong =
      expected[i].eligible &&
      isClear(heard[j]) &&
      pitchClass(heard[j], expected[i].midi) === 'other';
    return (0.5 * distance) / windows[i] + (wrong ? WRONG_PITCH_COST : 0);
  };
  // cost[i][j]: best alignment of the first i notes with the first j attacks.
  const width = m + 1;
  const cost = new Float32Array((n + 1) * width);
  const step = new Uint8Array((n + 1) * width);
  for (let j = 1; j <= m; j++) {
    cost[j] = j * EXTRA_COST;
    step[j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    cost[i * width] = i * MISS_COST;
    step[i * width] = 1;
    for (let j = 1; j <= m; j++) {
      const miss = cost[(i - 1) * width + j] + MISS_COST;
      const extra = cost[i * width + j - 1] + EXTRA_COST;
      const pair = cost[(i - 1) * width + j - 1] + pairCost(i - 1, j - 1);
      const best = Math.min(pair, miss, extra);
      cost[i * width + j] = best;
      step[i * width + j] = best === pair ? 0 : best === miss ? 1 : 2;
    }
  }
  const matches = new Array<number>(n).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const move = step[i * width + j];
    if (move === 0) matches[--i] = --j;
    else if (move === 1) i--;
    else j--;
  }
  return expected.map((note, i): NoteResult => {
    const base = { bar: note.bar, midi: note.midi, heard: null, delta: null };
    if (!note.eligible) return { ...base, status: 'unclear', timingStatus: 'unclear' };
    if (matches[i] < 0)
      return {
        ...base,
        status: healthyInput ? 'missed' : 'unclear',
        timingStatus: timingInput ? 'missed' : 'unclear',
      };
    const observation = heard[matches[i]];
    const timed = reliableTiming(observation);
    const pitch = isClear(observation) ? pitchClass(observation, note.midi) : null;
    return {
      bar: note.bar,
      midi: note.midi,
      heard: observation.midi,
      status: pitch === null ? 'unclear' : pitch === 'other' ? 'pitch' : 'matched',
      delta: timed ? Math.round((observation.time - offset - targets[i]) * 1000) : null,
      timingStatus: timed ? 'matched' : 'unclear',
      // The detector can land an octave away on a weak fundamental; not a wrong note.
      ...(pitch === 'octave' ? { octave: true } : {}),
    };
  });
}

export function exampleNotes(expected: ExpectedNote[]): NoteResult[] {
  return expected.map((note, index) => ({
    bar: note.bar,
    midi: note.midi,
    heard: index % 13 === 7 ? note.midi + 1 : note.midi,
    status:
      !note.eligible || index % 19 === 18 ? 'unclear' : index % 13 === 7 ? 'pitch' : 'matched',
    delta: index % 8 === 0 ? 48 : [12, -19, 22, -14, 27, 16][index % 6],
  }));
}

export function coaching(take: Take) {
  if (take.coverage < 60)
    return {
      title: 'Let’s get a clearer listen.',
      body: 'Too much of this take was unclear to suggest a musical correction. Try headphones and a clean, isolated instrument signal.',
      action: 'Check your input',
      kind: 'input' as const,
    };
  const wrong = take.notes.filter((n) => n.status === 'pitch' || n.status === 'missed');
  if (wrong.length >= 2)
    return {
      title: 'Give the notes a little more room.',
      body: `A few notes around bar ${wrong[0].bar} need a second listen. Slow the phrase, find the notes, then reconnect it.`,
      action: 'Try a slower phrase',
      kind: 'pitch' as const,
    };
  if (
    (take.timingScore !== undefined && take.timingScore !== null && take.timingScore < 90) ||
    (take.timingMs !== null && take.timingMs > 30)
  ) {
    // With a known latency, even playing that sits off the beat is worth naming.
    const placement = take.latencySource ? (take.placementMs ?? null) : null;
    const steady =
      placement !== null && Math.abs(placement) > 35 && (take.spreadMs ?? Infinity) <= 35;
    return {
      title: steady
        ? placement > 0
          ? 'Lean into the beat.'
          : 'Let the beat come to you.'
        : 'Find a steady landing.',
      body: steady
        ? `Your notes are even, but sit about ${Math.abs(Math.round(placement))} ms ${placement > 0 ? 'behind' : 'ahead of'} the band. Try it with a click and aim for the ${placement > 0 ? 'front' : 'back'} edge of each beat${take.latencySource === 'reported' ? '. If this seems wrong, calibrate your input timing' : ''}.`
        : 'Some entries sit away from the pulse. Try the transition with a click, then bring the band back. Timing is an estimate on this setup.',
      action: 'Practice the transition',
      kind: 'timing' as const,
    };
  }
  return {
    title: 'Ready for another small step?',
    body: 'Keep the same phrase and try four BPM faster. A comfortable, repeatable take matters more than a single perfect pass.',
    action: 'Try +4 BPM',
    kind: 'advance' as const,
  };
}
