import { model, Settings } from '@coderline/alphatab';
import type { JamRecipe, Piece } from '../domain/types';
import { expandChords } from './jam';
import { bassBar, drumBar, pianoBar, pianoVoicing } from './bandArrangement';

type Part = { name: string; program: number; tuning: number[]; channel: number };
const parts: Part[] = [
  { name: 'Lead guitar', program: 27, tuning: [64, 59, 55, 50, 45, 40], channel: 0 },
  { name: 'Electric bass', program: 33, tuning: [43, 38, 33, 28], channel: 2 },
  { name: 'Grand piano', program: 0, tuning: [], channel: 4 },
  { name: 'Studio drums', program: 0, tuning: [], channel: 9 },
];

function addNote(beat: model.Beat, midi: number, part: Part, previous: model.Note | null) {
  const note = new model.Note();
  if (part.channel === 9) note.percussionArticulation = midi;
  else if (part.tuning.length) {
    const choices = part.tuning
      .map((pitch, index) => ({ index, fret: midi - pitch }))
      .filter((x) => x.fret >= 0 && x.fret <= 20);
    const cost = (choice: { index: number; fret: number }) =>
      Math.abs(choice.fret - 5) +
      (previous
        ? Math.abs(choice.fret - previous.fret) +
          Math.abs(part.tuning.length - choice.index - previous.string) * 2
        : 0);
    choices.sort((a, b) => cost(a) - cost(b));
    const selected = choices[0];
    if (selected) {
      note.string = part.tuning.length - selected.index;
      note.fret = selected.fret;
    } else {
      note.octave = Math.floor(midi / 12);
      note.tone = midi % 12;
    }
  } else {
    note.octave = Math.floor(midi / 12);
    note.tone = midi % 12;
  }
  beat.addNote(note);
  return note;
}

export function createScore(piece: Piece, recipe: JamRecipe): model.Score {
  const score = new model.Score();
  score.title = piece.title;
  score.artist = 'Practice Room · original study';
  // Generated expression is applied to playback, rather than printed on every beat.
  score.stylesheet.hideDynamics = true;
  const chords = expandChords(recipe);
  const majorSignatures: Record<string, number> = {
    C: 0,
    'C#': 7,
    Db: -5,
    D: 2,
    'D#': -3,
    Eb: -3,
    E: 4,
    F: -1,
    'F#': 6,
    Gb: -6,
    G: 1,
    'G#': -4,
    Ab: -4,
    A: 3,
    'A#': -2,
    Bb: -2,
    B: 5,
  };
  let signature = majorSignatures[recipe.key] - (recipe.minor ? 3 : 0);
  if (signature < -7) signature += 12;

  chords.forEach((_, index) => {
    const mb = new model.MasterBar();
    mb.timeSignatureNumerator = 4;
    mb.timeSignatureDenominator = 4;
    if (recipe.feel === 'shuffle') mb.tripletFeel = model.TripletFeel.Triplet8th;
    if (index === 0)
      mb.tempoAutomations.push(model.Automation.buildTempoAutomation(false, 0, recipe.bpm, 2));
    score.addMasterBar(mb);
  });
  parts.forEach((part, partIndex) => {
    let previousNote: model.Note | null = null;
    let voicing: number[] = [];
    const track = new model.Track();
    track.name = part.name;
    track.shortName = part.name.split(' ').at(-1) ?? part.name;
    track.playbackInfo.program = part.program;
    track.playbackInfo.primaryChannel = part.channel;
    track.playbackInfo.secondaryChannel = part.channel === 9 ? 9 : part.channel + 1;
    // The recorded bank owns instrument balance. MIDI volume has a cubic gain curve,
    // so the old per-part values were burying drums before the mixer even applied.
    track.playbackInfo.volume = 12;
    score.addTrack(track);
    const staff = new model.Staff();
    staff.stringTuning = new model.Tuning('', part.tuning, false);
    staff.isPercussion = partIndex === 3;
    staff.showTablature = part.tuning.length > 0;
    track.addStaff(staff);
    chords.forEach((chord, barIndex) => {
      const bar = new model.Bar();
      staff.addBar(bar);
      bar.keySignature = signature;
      bar.keySignatureType = recipe.minor
        ? model.KeySignatureType.Minor
        : model.KeySignatureType.Major;
      if (partIndex === 1) bar.clef = model.Clef.F4;
      const voice = new model.Voice();
      bar.addVoice(voice);
      const count = piece.id === 'first-light' ? 4 : 8;
      if (partIndex === 2) voicing = pianoVoicing(chord, voicing);
      const planned =
        partIndex === 3
          ? drumBar(recipe.feel, barIndex)
          : partIndex === 2
            ? pianoBar(voicing, recipe.feel, barIndex)
            : partIndex === 1
              ? bassBar(chord, chords[(barIndex + 1) % chords.length], barIndex)
              : Array.from({ length: count }, (_, step) => {
                  const pattern = [0, 1, 2, 1, 3, 2, 1, 0];
                  const interval = chord.intervals[pattern[(step + (barIndex % 2 ? 2 : 0)) % 8]];
                  return {
                    eighths: 8 / count,
                    notes: [52 + ((chord.root - 4 + 12) % 12) + interval],
                  };
                });
      for (const [step, plannedBeat] of planned.entries()) {
        const beat = new model.Beat();
        beat.duration =
          plannedBeat.eighths === 1
            ? model.Duration.Eighth
            : plannedBeat.eighths === 4
              ? model.Duration.Half
              : model.Duration.Quarter;
        beat.dots = plannedBeat.eighths === 3 ? 1 : 0;
        beat.dynamics = model.DynamicValue.MF;
        if (step === 0 && partIndex === 0) beat.text = chord.name;
        voice.addBeat(beat);
        for (const pitch of plannedBeat.notes)
          previousNote = addNote(beat, pitch, part, previousNote);
      }
    });
  });
  score.finish(new Settings());
  return score;
}
