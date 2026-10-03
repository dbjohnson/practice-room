import { model, Settings } from '@coderline/alphatab';
import { fingerChord, tuningFor } from '../fretting';
import { parseMidi, PPQ, type MidiPart, type MidiSong } from './parseMidi';
import { quantize, type BarSpan, type QuantizedBeat } from './quantize';

const MAX_BARS = 2000;
const MAX_PARTS = 16;
const durations: Record<number, [model.Duration, dots: number]> = {
  3840: [model.Duration.Whole, 0],
  2880: [model.Duration.Half, 1],
  1920: [model.Duration.Half, 0],
  1440: [model.Duration.Quarter, 1],
  960: [model.Duration.Quarter, 0],
  720: [model.Duration.Eighth, 1],
  480: [model.Duration.Eighth, 0],
  360: [model.Duration.Sixteenth, 1],
  240: [model.Duration.Sixteenth, 0],
  120: [model.Duration.ThirtySecond, 0],
  640: [model.Duration.Quarter, 0],
  320: [model.Duration.Eighth, 0],
  160: [model.Duration.Sixteenth, 0],
};

type Meter = { numerator: number; denominator: number };
function layout(song: MidiSong) {
  const end = song.parts.reduce(
    (latest, part) => part.notes.reduce((last, note) => Math.max(last, note.end), latest),
    0,
  );
  const bars: (BarSpan & Meter & { bpm: number })[] = [];
  let meter: Meter = { numerator: 4, denominator: 4 },
    bpm = song.tempos[0]?.bpm ?? 120,
    meters = 0,
    tempos = 0;
  for (let start = 0; start < end;) {
    while (song.meters[meters]?.tick <= start) meter = song.meters[meters++];
    while (song.tempos[tempos]?.tick <= start) bpm = song.tempos[tempos++].bpm;
    const length = (meter.numerator * PPQ * 4) / meter.denominator;
    bars.push({ start, length, bpm, numerator: meter.numerator, denominator: meter.denominator });
    start += length;
    if (bars.length > MAX_BARS)
      throw new Error('Choose a score with fewer than 2,000 measures for this prototype.');
  }
  return bars;
}

function addStaff(track: model.Track, part: MidiPart, bars: QuantizedBeat[][], song: MidiSong) {
  const pitches = part.notes.map((note) => note.midi).sort((a, b) => a - b);
  const percussion = part.channel === 9;
  const tuning = percussion
    ? null
    : tuningFor(part.program, part.name, pitches[0], pitches.at(-1)!);
  const staff = new model.Staff();
  staff.isPercussion = percussion;
  staff.stringTuning = new model.Tuning('', tuning ?? [], false);
  staff.showTablature = !!tuning;
  // Guitar and bass are written an octave above where they sound.
  if (tuning) staff.displayTranspositionPitch = -12;
  track.addStaff(staff);
  const low = !percussion && pitches[pitches.length >> 1] + (tuning ? 12 : 0) < 55;
  let position = 3,
    previous: model.Beat | null = null;
  for (const beats of bars) {
    const bar = new model.Bar();
    staff.addBar(bar);
    if (low) bar.clef = model.Clef.F4;
    if (song.key && !percussion) {
      bar.keySignature = Math.max(-7, Math.min(7, song.key.fifths));
      bar.keySignatureType = song.key.minor
        ? model.KeySignatureType.Minor
        : model.KeySignatureType.Major;
    }
    const voice = new model.Voice();
    bar.addVoice(voice);
    for (const planned of beats) {
      const beat = new model.Beat();
      [beat.duration, beat.dots] = durations[planned.ticks];
      if (planned.tuplet) [beat.tupletNumerator, beat.tupletDenominator] = [3, 2];
      voice.addBeat(beat);
      const tie = planned.tied ? previous : null;
      const add = (set: (note: model.Note) => void) => {
        const note = new model.Note();
        set(note);
        beat.addNote(note);
      };
      // A drum hit does not sustain, so its continuation is left as a rest.
      if (tie && !percussion)
        for (const origin of tie.notes)
          add((note) => {
            if (tuning) [note.string, note.fret] = [origin.string, origin.fret];
            else [note.octave, note.tone] = [origin.octave, origin.tone];
            note.isTieDestination = true;
          });
      else if (tuning && !tie) {
        const fingered = fingerChord(planned.pitches, tuning, position);
        position = fingered.position;
        for (const placed of fingered.notes)
          add((note) => ([note.string, note.fret] = [placed.string, placed.fret]));
      } else if (!tie)
        for (const midi of planned.pitches)
          add((note) => {
            if (percussion) note.percussionArticulation = midi;
            else [note.octave, note.tone] = [Math.floor(midi / 12), midi % 12];
          });
      previous = beat;
    }
  }
}

export function midiToScore(bytes: Uint8Array): model.Score {
  const song = parseMidi(bytes);
  const bars = layout(song);
  const score = new model.Score();
  score.title = song.title;
  score.stylesheet.hideDynamics = true;
  bars.forEach((bar, index) => {
    const master = new model.MasterBar();
    master.timeSignatureNumerator = bar.numerator;
    master.timeSignatureDenominator = bar.denominator;
    if (!index || Math.abs(bar.bpm - bars[index - 1].bpm) >= 1)
      master.tempoAutomations.push(
        model.Automation.buildTempoAutomation(false, 0, Math.round(bar.bpm), 2),
      );
    score.addMasterBar(master);
  });
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  const parts = song.parts
    .filter((part) => part.notes.length)
    .sort((a, b) => Number(a.channel === 9) - Number(b.channel === 9))
    .slice(0, MAX_PARTS);
  parts.forEach((part, index) => {
    const track = new model.Track();
    track.name = part.name;
    track.shortName = part.name.slice(0, 10);
    const channel = part.channel === 9 ? 9 : free[index % free.length];
    track.playbackInfo.program = part.program;
    track.playbackInfo.primaryChannel = track.playbackInfo.secondaryChannel = channel;
    track.playbackInfo.volume = 12;
    score.addTrack(track);
    addStaff(track, part, quantize(part.notes, bars), song);
  });
  score.finish(new Settings());
  return score;
}
