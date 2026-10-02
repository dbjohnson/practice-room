import { model, Settings } from '@coderline/alphatab';

const modulo = (value: number) => ((value % 12) + 12) % 12;
const signatures = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
export const keyNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const naturals: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const normalizeTranspose = (value: number) =>
  Number.isInteger(value) ? Math.max(-12, Math.min(12, value)) : 0;

const exerciseKeys = new WeakMap<model.Score, { pitch: number; minor: boolean; label: string }>();
export const registerScoreKey = (
  score: model.Score,
  key: { pitch: number; minor: boolean; label: string },
) => {
  exerciseKeys.set(score, key);
};

export function scoreKey(score: model.Score) {
  const known = exerciseKeys.get(score);
  if (known) return known;
  const bar = score.tracks.flatMap((t) => t.staves).find((s) => !s.isPercussion)?.bars[0];
  const minor = bar?.keySignatureType === model.KeySignatureType.Minor;
  const pitch = modulo((bar?.keySignature ?? 0) * 7 + (minor ? 9 : 0));
  return { pitch, minor, label: `${keyNames[pitch]} ${minor ? 'minor' : 'major'}` };
}

function chordName(name: string, semitones: number) {
  return name.replace(
    /(^|\/)([A-G])([#b♯♭]?)/g,
    (_, prefix: string, root: string, accidental: string) =>
      prefix +
      keyNames[
        modulo(
          naturals[root] +
            (/[#♯]/.test(accidental) ? 1 : /[b♭]/.test(accidental) ? -1 : 0) +
            semitones,
        )
      ],
  );
}

/** Clone from the authored score so repeated changes never accumulate or alter the saved import. */
export function transposeScore(source: model.Score, semitones: number, textChords = false) {
  if (!semitones) return { score: source, warnings: [] as string[] };
  const score = model.JsonConverter.jsObjectToScore(model.JsonConverter.scoreToJsObject(source));
  const warnings: string[] = [];
  for (const track of score.tracks)
    for (const staff of track.staves) {
      if (staff.isPercussion) continue;
      const notes = staff.bars.flatMap((bar) =>
        bar.voices.flatMap((voice) => voice.beats.flatMap((beat) => beat.notes)),
      );
      const pitches = new Map(notes.map((note) => [note, note.realValue + semitones]));
      if ([...pitches.values()].some((pitch) => pitch < 0 || pitch > 127))
        throw new Error('This transposition puts notes outside the supported pitch range.');
      let tabPossible = true;
      for (const bar of staff.bars) {
        if (semitones % 12) bar.keySignature = signatures[modulo(bar.keySignature * 7 + semitones)];
        for (const voice of bar.voices)
          for (const beat of voice.beats) {
            if (textChords && beat.text) beat.text = chordName(beat.text, semitones);
            const used = new Set<number>();
            for (const note of beat.notes) {
              note.accidentalMode = model.NoteAccidentalMode.Default;
              const target = pitches.get(note)!;
              if (!note.isStringed) {
                const written = target + staff.transpositionPitch;
                note.octave = Math.floor(written / 12);
                note.tone = modulo(written);
                continue;
              }
              // Natural harmonics cannot generally move to arbitrary frets on unchanged tuning.
              if (note.harmonicType === model.HarmonicType.Natural) {
                tabPossible = false;
                continue;
              }
              const choices = staff.tuning
                .map((open, index) => ({
                  string: staff.tuning.length - index,
                  fret: target + staff.transpositionPitch - open - staff.capo - note.harmonicPitch,
                }))
                .filter((p) => p.fret >= 0 && p.fret <= 24 && !used.has(p.string));
              choices.sort(
                (a, b) =>
                  (a.string === note.string ? -100 : 0) +
                  Math.abs(a.fret - note.fret) -
                  ((b.string === note.string ? -100 : 0) + Math.abs(b.fret - note.fret)),
              );
              const position = choices[0];
              if (!position) {
                tabPossible = false;
                continue;
              }
              note.string = position.string;
              note.fret = position.fret;
              used.add(position.string);
            }
          }
      }
      if (!tabPossible) {
        // Preserve exact concert pitches; do not invent negative frets or silently shift octaves.
        for (const note of notes) {
          const written = pitches.get(note)! + staff.transpositionPitch;
          note.string = -1;
          note.fret = -1;
          note.octave = Math.floor(written / 12);
          note.tone = modulo(written);
        }
        staff.stringTuning = new model.Tuning('', [], false);
        staff.showTablature = false;
        warnings.push(
          `${track.name}: this key needs notes or harmonics outside the original fingering. Showing standard notation.`,
        );
      }
      for (const chord of staff.chords?.values() ?? []) {
        chord.name = chordName(chord.name, semitones);
        const frets = chord.strings.map((fret) => (fret < 0 ? fret : fret + semitones));
        if (
          !tabPossible ||
          chord.strings.some((fret) => fret >= 0 && (fret + semitones < 0 || fret + semitones > 24))
        ) {
          chord.showDiagram = false;
          chord.showFingering = false;
        } else {
          chord.strings = frets;
          chord.barreFrets = chord.barreFrets.map((fret) => fret + semitones);
          chord.firstFret = Math.max(1, Math.min(...frets.filter((fret) => fret > 0), 24));
        }
      }
    }
  score.finish(new Settings());
  const known = exerciseKeys.get(source);
  if (known)
    registerScoreKey(score, {
      ...known,
      pitch: modulo(known.pitch + semitones),
      label: known.label.replace(/^[A-G][#b]?/, keyNames[modulo(known.pitch + semitones)]),
    });
  return { score, warnings };
}
