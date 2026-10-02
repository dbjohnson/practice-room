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
  return {
    pitchAccuracy,
    timingScore,
    timingCoverage,
    overallScore:
      coverage >= 60 && timingCoverage >= 60 && pitchAccuracy !== null && timingScore !== null
        ? Math.round((pitchAccuracy + timingScore) / 2)
        : null,
    timingMs: median(
      timed.filter((note) => note.delta !== null).map((note) => Math.abs(note.delta!)),
    ),
    coverage,
  };
}

export function assess(
  expected: ExpectedNote[],
  observations: Observation[],
  bpm: number,
  startTick: number,
  offsetMs = 0,
): NoteResult[] {
  const used = new Set<number>();
  const healthyInput = observations.some(
    (o) => o.rms > 0.012 && o.rms < 0.8 && o.midi !== null && o.confidence >= 0.88,
  );
  const reliableTiming = (o: Observation) =>
    o.timingReliable ?? (o.midi !== null && o.confidence >= 0.88 && o.rms > 0.012 && o.rms < 0.8);
  const timingInput = observations.some(reliableTiming);
  return expected.map((note, index) => {
    const target = ticksToSeconds(note.tick - startTick, bpm);
    const nextGap = expected[index + 1]
      ? ticksToSeconds(expected[index + 1].tick - note.tick, bpm)
      : 0.4;
    const window = Math.min(0.22, Math.max(0.06, nextGap * 0.45));
    let match = -1;
    let distance = Infinity;
    observations.forEach((o, i) => {
      const delta = Math.abs(o.time - offsetMs / 1000 - target);
      if (!used.has(i) && delta < distance && delta <= window) {
        match = i;
        distance = delta;
      }
    });
    if (!note.eligible)
      return {
        bar: note.bar,
        midi: note.midi,
        heard: null,
        status: 'unclear',
        delta: null,
        timingStatus: 'unclear',
      };
    if (match < 0)
      return {
        bar: note.bar,
        midi: note.midi,
        heard: null,
        status: healthyInput ? 'missed' : 'unclear',
        delta: null,
        timingStatus: timingInput ? 'missed' : 'unclear',
      };
    used.add(match);
    const observation = observations[match];
    const clear =
      observation.confidence >= 0.88 && observation.midi !== null && observation.rms < 0.8;
    return {
      bar: note.bar,
      midi: note.midi,
      heard: observation.midi,
      status: !clear
        ? 'unclear'
        : Math.abs(observation.midi! - note.midi) < 0.65
          ? 'matched'
          : 'pitch',
      delta: reliableTiming(observation)
        ? Math.round((observation.time - offsetMs / 1000 - target) * 1000)
        : null,
      timingStatus: reliableTiming(observation) ? 'matched' : 'unclear',
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
  )
    return {
      title: 'Find a steady landing.',
      body: 'Some entries sit away from the pulse. Try the transition with a click, then bring the band back. Timing is an estimate on this setup.',
      action: 'Practice the transition',
      kind: 'timing' as const,
    };
  return {
    title: 'Ready for another small step?',
    body: 'Keep the same phrase and try four BPM faster. A comfortable, repeatable take matters more than a single perfect pass.',
    action: 'Try +4 BPM',
    kind: 'advance' as const,
  };
}
