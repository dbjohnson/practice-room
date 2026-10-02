import { model, Settings } from '@coderline/alphatab';
import type { Exercise, ExerciseRhythm, GymSet } from '../domain/gym';
import type { Piece } from '../domain/types';
import { exercisePitches } from './exercisePatterns';
import { scales } from './exerciseCatalog';
import { exerciseSet } from '../domain/gymPlan';
import { keyNames, registerScoreKey, transposeScore } from './transposeScore';
import { readScore, storeScore } from '../storage/library';

type Event = { pitches: number[]; ticks: number };
const rhythms: Record<ExerciseRhythm, number[]> = {
  original: [480],
  quarters: [960],
  eighths: [480],
  sixteenths: [240],
  triplets: [320],
  dotted: [720, 240],
  swing: [640, 320],
  syncopated: [480, 960, 480, 480, 960, 480],
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function duration(beat: model.Beat, ticks: number) {
  const durations: [number, model.Duration][] = [
    [3840, model.Duration.Whole],
    [1920, model.Duration.Half],
    [960, model.Duration.Quarter],
    [480, model.Duration.Eighth],
    [240, model.Duration.Sixteenth],
    [120, model.Duration.ThirtySecond],
    [60, model.Duration.SixtyFourth],
  ];
  const plain = durations.find(([value]) => value === ticks),
    dotted = durations.find(([value]) => value * 1.5 === ticks);
  if (plain) beat.duration = plain[1];
  else if (dotted) {
    beat.duration = dotted[1];
    beat.dots = 1;
  } else {
    beat.duration = model.Duration.Eighth;
    const divisor = gcd(480, ticks);
    beat.tupletNumerator = 480 / divisor;
    beat.tupletDenominator = ticks / divisor;
  }
}
function scoreEvents(exercise: Exercise, source?: model.Score): Event[] {
  if (exercise.source.kind !== 'score')
    return exercisePitches(exercise).map((pitch) => ({
      pitches: pitch === null ? [] : [pitch],
      ticks: 480,
    }));
  const spec = exercise.source,
    staff = source?.tracks[spec.track]?.staves[0];
  if (!staff || staff.isPercussion)
    throw new Error('Choose a pitched guitar, bass or keyboard part.');
  if (spec.endBar > staff.bars.length)
    throw new Error('The saved score does not contain that bar range.');
  const events: Event[] = [];
  for (const bar of staff.bars.slice(spec.startBar - 1, spec.endBar))
    for (const beat of bar.voices[0]?.beats ?? []) {
      if (beat.graceType !== model.GraceType.None || beat.playbackDuration <= 0) continue;
      const pitches = beat.notes.map((n) => n.realValue),
        ticks = Math.max(1, Math.round(beat.playbackDuration));
      const previous = events.at(-1);
      if (
        previous &&
        pitches.length &&
        beat.notes.every((n) => n.isTieDestination) &&
        JSON.stringify(previous.pitches) === JSON.stringify(pitches)
      )
        previous.ticks += ticks;
      else events.push({ pitches, ticks });
    }
  if (!events.some((e) => e.pitches.length)) throw new Error('Choose a passage containing notes.');
  if (events.length > 2048)
    throw new Error('Choose a shorter exercise passage (up to 2,048 beats).');
  return events;
}
function signature(exercise: Exercise) {
  const sourceId = exercise.source.kind === 'scale' ? exercise.source.scaleId : null;
  const scale = scales.find((s) => s.id === sourceId);
  const key = exercise.source.key,
    major = [0, 2, 4, 5, 7, 9, 11],
    signatures = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
  if (scale?.intervals.length === 7) {
    const tones = new Set(scale.intervals.map((n) => (n + key) % 12));
    const parent = Array.from({ length: 12 }, (_, i) => i).find((root) =>
      major.every((n) => tones.has((n + root) % 12)),
    );
    if (parent !== undefined) return signatures[parent];
  }
  return signatures[(key + (scale?.intervals.includes(3) ? 3 : 0)) % 12];
}
export function createExerciseScore(
  exercise: Exercise,
  set: GymSet = exerciseSet(exercise),
  source?: model.Score,
) {
  if (!Number.isInteger(set.keyOffset) || Math.abs(set.keyOffset) > 24)
    throw new Error('Exercise transposition must be within two octaves.');
  const events = scoreEvents(exercise, source).map((event, i) => ({
    ...event,
    ticks:
      set.rhythm === 'original' ? event.ticks : rhythms[set.rhythm][i % rhythms[set.rhythm].length],
  }));
  const score = new model.Score();
  score.title = exercise.title;
  score.artist = 'Practice Room gym';
  score.stylesheet.hideDynamics = true;
  const track = new model.Track();
  track.name = exercise.instrument === 'bass' ? 'Exercise bass' : 'Exercise guitar';
  track.shortName = exercise.instrument;
  track.playbackInfo.program = exercise.instrument === 'bass' ? 33 : 27;
  track.playbackInfo.primaryChannel = 0;
  track.playbackInfo.secondaryChannel = 1;
  track.playbackInfo.volume = 12;
  score.addTrack(track);
  const staff = new model.Staff(),
    tuning = exercise.instrument === 'bass' ? [43, 38, 33, 28] : [64, 59, 55, 50, 45, 40];
  staff.stringTuning = new model.Tuning('', tuning, false);
  staff.showTablature = true;
  track.addStaff(staff);
  let voice: model.Voice;
  let position = 3840,
    tab = true;
  let previous: model.Note | null = null;
  const all: { note: model.Note; pitch: number }[] = [];
  const newBar = () => {
    const master = new model.MasterBar();
    master.timeSignatureNumerator = 4;
    master.timeSignatureDenominator = 4;
    if (!score.masterBars.length)
      master.tempoAutomations.push(model.Automation.buildTempoAutomation(false, 0, set.tempo, 2));
    score.addMasterBar(master);
    const bar = new model.Bar();
    const sourceBar =
      exercise.source.kind === 'score'
        ? source?.tracks[exercise.source.track]?.staves[0]?.bars[exercise.source.startBar - 1]
        : undefined;
    bar.keySignature = sourceBar?.keySignature ?? signature(exercise);
    if (sourceBar) bar.keySignatureType = sourceBar.keySignatureType;
    if (exercise.instrument === 'bass') bar.clef = model.Clef.F4;
    staff.addBar(bar);
    voice = new model.Voice();
    bar.addVoice(voice);
    position = 0;
  };
  events.forEach((event, index) => {
    let left = event.ticks,
      continuation = false;
    while (left > 0) {
      if (position === 3840) newBar();
      const ticks = Math.min(left, 3840 - position),
        beat = new model.Beat();
      duration(beat, ticks);
      voice.addBeat(beat);
      beat.dynamics = model.DynamicValue.MF;
      if (set.articulation === 'alternate')
        beat.pickStroke = index % 2 ? model.PickStroke.Up : model.PickStroke.Down;
      if (index === 0 && !continuation && set.articulation === 'legato') beat.text = 'legato';
      const used = new Set<number>();
      for (const pitch of event.pitches) {
        const note = new model.Note();
        note.isTieDestination = continuation;
        const choices = tuning
          .map((open, i) => ({ string: tuning.length - i, fret: pitch - open }))
          .filter((p) => p.fret >= 0 && p.fret <= 24 && !used.has(p.string));
        choices.sort((a, b) => {
          const cost = (p: typeof a) =>
            Math.abs(p.fret - 5) +
            (previous
              ? Math.abs(p.fret - previous.fret) + Math.abs(p.string - previous.string) * 2
              : 0);
          return cost(a) - cost(b);
        });
        const choice = choices[0];
        if (choice) {
          note.string = choice.string;
          note.fret = choice.fret;
          used.add(choice.string);
        } else tab = false;
        note.octave = Math.floor(pitch / 12);
        note.tone = pitch % 12;
        note.isStaccato = set.articulation === 'staccato';
        if (set.articulation === 'legato') note.accentuated = model.AccentuationType.Tenuto;
        if (
          (set.articulation === 'downbeat' && position % 960 === 0) ||
          (set.articulation === 'offbeat' && position % 960 !== 0)
        )
          note.accentuated = model.AccentuationType.Normal;
        beat.addNote(note);
        all.push({ note, pitch });
        previous = note;
      }
      position += ticks;
      left -= ticks;
      continuation = true;
    }
  });
  if (position < 3840) {
    const rest = new model.Beat();
    duration(rest, 3840 - position);
    voice!.addBeat(rest);
  }
  const warnings: string[] = [];
  if (!tab) {
    staff.stringTuning = new model.Tuning('', [], false);
    staff.showTablature = false;
    for (const { note, pitch } of all) {
      note.string = -1;
      note.fret = -1;
      note.octave = Math.floor(pitch / 12);
      note.tone = pitch % 12;
    }
    warnings.push(
      'This note range extends beyond the instrument’s TAB range. Showing standard notation.',
    );
  }
  score.finish(new Settings());
  const sourceId = exercise.source.kind === 'scale' ? exercise.source.scaleId : null;
  const scale = scales.find((s) => s.id === sourceId);
  registerScoreKey(score, {
    pitch: exercise.source.key,
    minor: !!scale?.intervals.includes(3),
    label: `${keyNames[exercise.source.key]} ${scale?.name ?? 'exercise'}`,
  });
  let shiftedScore = score,
    remaining = set.keyOffset;
  while (remaining !== 0) {
    const step = Math.max(-12, Math.min(12, remaining));
    const shifted = transposeScore(shiftedScore, step);
    shiftedScore = shifted.score;
    warnings.push(...shifted.warnings);
    remaining -= step;
  }
  return { score: shiftedScore, warnings: [...new Set(warnings)] };
}
export async function loadExerciseScore(exercise: Exercise, set = exerciseSet(exercise)) {
  let source: model.Score | undefined;
  if (exercise.source.kind === 'score') {
    const bytes = await readScore(exercise.source.snapshotId);
    if (!bytes) throw new Error('This exercise’s source score is missing. Upload it again.');
    source = model.JsonConverter.jsonToScore(new TextDecoder().decode(bytes));
  }
  return createExerciseScore(exercise, set, source);
}
export async function saveExerciseSource(score: model.Score) {
  const id = `gym-source-${crypto.randomUUID()}`;
  const bytes = new TextEncoder().encode(model.JsonConverter.scoreToJson(score));
  await storeScore(id, bytes.buffer as ArrayBuffer);
  return id;
}
export function exercisePiece(exercise: Exercise, set = exerciseSet(exercise)): Piece {
  return {
    id: exercise.id,
    title: exercise.title,
    subtitle: exercise.description,
    source: 'exercise',
    bpm: set.tempo,
    bars: 1,
    key: keyNames[(exercise.source.key + set.keyOffset + 12) % 12],
    tags: ['Exercise', exercise.instrument],
    color: 'sage',
    exercise,
    gymSet: set,
  };
}
