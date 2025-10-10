const noteStrings = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
];

/**
 * Converts a frequency in Hz to a musical note number (MIDI note).
 * @param frequency The frequency in Hz.
 * @returns The MIDI note number.
 */
function frequencyToNoteNumber(frequency: number): number {
  return Math.round(12 * (Math.log(frequency / 440) / Math.log(2))) + 69;
}

/**
 * Converts a frequency to a note name (e.g., "A4") and the deviation in cents.
 * @param frequency The frequency in Hz.
 * @returns An object with the note name and cents deviation.
 */
export function frequencyToNote(frequency: number): { noteName: string; cents: number } {
  const noteNum = frequencyToNoteNumber(frequency);
  const noteName = noteStrings[noteNum % 12];
  const octave = Math.floor(noteNum / 12) - 1;
  const expectedFrequency = 440 * Math.pow(2, (noteNum - 69) / 12);
  const cents = Math.round(1200 * (Math.log(frequency / expectedFrequency) / Math.log(2)));

  return {
    noteName: `${noteName}${octave}`,
    cents,
  };
}
