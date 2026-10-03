import { describe, expect, it } from 'vitest';
import { midi, Settings } from '@coderline/alphatab';
import { loadScore } from '../../src/music/loadScore';

const measure = (number: number, before = '') =>
  `<measure number="${number}">${number === 1 ? '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' : ''}${before}<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure>`;
const tempo = (bpm: number) => `<direction><sound tempo="${bpm}"/></direction>`;
const xml = (...measures: string[]) =>
  new TextEncoder().encode(
    `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`,
  );
const played = (bytes: Uint8Array) => {
  const score = loadScore(bytes);
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(
    score,
    new Settings(),
    new midi.AlphaSynthMidiFileHandler(file),
  ).generate();
  const tempos = file.events
    .filter((event) => event.type === midi.MidiEventType.TempoChange)
    .map((event) => [event.tick, Math.round((event as midi.TempoChangeEvent).beatsPerMinute)]);
  return { score, tempos };
};

describe('score loading', () => {
  it('reports the tempo playback uses when marks are stacked on the first beat', () => {
    const { score, tempos } = played(xml(measure(1, tempo(450) + tempo(45)), measure(2)));
    expect(score.tempo).toBe(45);
    expect(tempos).toEqual([[0, 45]]);
  });
  it('keeps tempo changes that fall on different beats and bars', () => {
    const { score, tempos } = played(xml(measure(1, tempo(60)), measure(2, tempo(90))));
    expect(score.tempo).toBe(60);
    expect(tempos).toEqual([
      [0, 60],
      [3840, 90],
    ]);
  });
});
