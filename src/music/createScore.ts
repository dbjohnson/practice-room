import { model, Settings } from '@coderline/alphatab';
import type { JamRecipe, Piece } from '../domain/types';
import { expandChords } from './jam';

type Part = { name: string; program: number; tuning: number[]; channel: number; volume: number };
const parts: Part[] = [
  { name: 'Lead guitar', program: 27, tuning: [64, 59, 55, 50, 45, 40], channel: 0, volume: 12 },
  { name: 'Electric bass', program: 33, tuning: [43, 38, 33, 28], channel: 2, volume: 10 },
  { name: 'Warm keys', program: 4, tuning: [], channel: 4, volume: 7 },
  { name: 'Studio drums', program: 0, tuning: [], channel: 9, volume: 9 },
];

function addNote(beat: model.Beat, midi: number, part: Part) {
  const note = new model.Note();
  if (part.channel === 9) note.percussionArticulation = midi;
  else if (part.tuning.length) {
    const choices = part.tuning
      .map((pitch, index) => ({ index, fret: midi - pitch }))
      .filter((x) => x.fret >= 0 && x.fret <= 20);
    choices.sort((a, b) => Math.abs(a.fret - 5) - Math.abs(b.fret - 5));
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
}

export function createScore(piece: Piece, recipe: JamRecipe): model.Score {
  const score = new model.Score();
  score.title = piece.title;
  score.artist = 'Practice Room · original study';
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
    const track = new model.Track();
    track.name = part.name;
    track.shortName = part.name.split(' ').at(-1) ?? part.name;
    track.playbackInfo.program = part.program;
    track.playbackInfo.primaryChannel = part.channel;
    track.playbackInfo.secondaryChannel = part.channel === 9 ? 9 : part.channel + 1;
    track.playbackInfo.volume = part.volume;
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
      const count =
        partIndex === 2
          ? 2
          : partIndex === 1 || (piece.id === 'first-light' && partIndex === 0)
            ? 4
            : 8;
      for (let step = 0; step < count; step++) {
        const beat = new model.Beat();
        beat.duration =
          count === 8
            ? model.Duration.Eighth
            : count === 4
              ? model.Duration.Quarter
              : model.Duration.Half;
        beat.dynamics = step % 2 === 0 ? model.DynamicValue.MF : model.DynamicValue.MP;
        if (step === 0 && partIndex === 0) beat.text = chord.name;
        voice.addBeat(beat);
        if (partIndex === 3) {
          addNote(beat, recipe.feel === 'bossa' ? 51 : 42, part);
          if (step === 0 || step === 4) addNote(beat, 36, part);
          if (step === 2 || step === 6) addNote(beat, recipe.feel === 'bossa' ? 37 : 38, part);
        } else if (partIndex === 2) {
          for (const interval of chord.intervals.slice(1))
            addNote(beat, 48 + chord.root + interval, part);
        } else if (partIndex === 1) {
          const interval = [0, 7, chord.intervals[1], 7][step];
          addNote(beat, 28 + ((chord.root - 4 + 12) % 12) + interval, part);
        } else {
          const pattern = [0, 1, 2, 1, 3, 2, 1, 0];
          const interval = chord.intervals[pattern[(step + (barIndex % 2 ? 2 : 0)) % 8]];
          addNote(beat, 52 + ((chord.root - 4 + 12) % 12) + interval, part);
        }
      }
    });
  });
  score.finish(new Settings());
  return score;
}
