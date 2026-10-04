import { midi } from '@coderline/alphatab';
import { expect, it } from 'vitest';
import { midiLoopTiming, repeatMidiRange } from '../../src/audio/loopMidi';

it('chases a held note at the passage start and releases it at each exact wrap', () => {
  const file = new midi.MidiFile();
  file.addEvent(new midi.NoteOnEvent(0, 0, 0, 60, 90));
  file.addEvent(new midi.NoteOffEvent(0, 6000, 0, 60, 0));
  file.addEvent(new midi.NoteOnEvent(0, 2880, 0, 67, 90));
  file.addEvent(new midi.NoteOffEvent(0, 3600, 0, 67, 0));
  const repeated = repeatMidiRange(file, 960, 2880, 1);
  const notes = repeated.events.filter((event) => event instanceof midi.NoteEvent);
  expect(notes.map((event) => [event.tick, event.type, event.noteKey])).toEqual([
    [0, midi.MidiEventType.NoteOn, 60],
    [1920, midi.MidiEventType.NoteOff, 60],
    [1920, midi.MidiEventType.NoteOn, 60],
    [3840, midi.MidiEventType.NoteOff, 60],
  ]);
  expect(file.events[0].tick).toBe(0);
});

it('integrates tempo changes and keeps the visual cursor at the right absolute passage tick', () => {
  const file = new midi.MidiFile();
  file.addEvent(new midi.TempoChangeEvent(0, 500000));
  file.addEvent(new midi.TempoChangeEvent(1920, 1000000));
  const timing = midiLoopTiming(file, 960, 3840, 0.5, 120, 3, 4);
  expect(timing.duration).toBe(5);
  expect(timing.beatTimes).toEqual([0, 1, 3]);
  expect(timing.countInBeats).toBe(3);
  expect(timing.countInBeatDuration).toBe(1);
  expect(timing.tickAt(0)).toBe(960);
  expect(timing.tickAt(1)).toBe(1920);
  expect(timing.tickAt(2)).toBe(2400);
  expect(timing.tickAt(5)).toBe(3839);
  const tempos = repeatMidiRange(file, 960, 3840, 0.5).events.filter(
    (e) => e instanceof midi.TempoChangeEvent,
  );
  expect(tempos.map((e) => [e.tick, e.beatsPerMinute])).toEqual([
    [0, 60],
    [960, 30],
    [2880, 60],
    [3840, 30],
  ]);
});
