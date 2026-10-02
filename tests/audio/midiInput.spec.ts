import { describe, expect, it } from 'vitest';
import { assess } from '../../src/audio/assessment';
import { midiDevices, midiObservation } from '../../src/audio/midiInput';
import type { ExpectedNote } from '../../src/domain/types';

const bytes = (...values: number[]) => new Uint8Array(values);
describe('MIDI instrument input', () => {
  it('turns note-on messages on any channel into exact notes on the take clock', () => {
    expect(midiObservation(bytes(0x90, 60, 100), 12345)).toMatchObject({
      time: 12.345,
      midi: 60,
      confidence: 1,
    });
    expect(midiObservation(bytes(0x93, 40, 1), 0)?.midi).toBe(40);
    const soft = midiObservation(bytes(0x90, 60, 1), 0)!;
    const hard = midiObservation(bytes(0x90, 60, 127), 0)!;
    expect(soft.rms).toBeGreaterThan(0.012);
    expect(hard.rms).toBeLessThan(0.8);
    expect(hard.rms).toBeGreaterThan(soft.rms);
  });
  it('ignores note-offs, running note-on with zero velocity and other messages', () => {
    for (const message of [
      bytes(0x80, 60, 64),
      bytes(0x90, 60, 0),
      bytes(0xb0, 64, 127),
      bytes(0xe0, 0, 64),
      bytes(0xf8),
      null,
    ])
      expect(midiObservation(message, 0)).toBeNull();
  });
  it('lists connected inputs with a fallback name', () => {
    const inputs = new Map([
      ['a', { id: 'a', name: 'Stage piano', state: 'connected' }],
      ['b', { id: 'b', name: '', state: 'connected' }],
      ['c', { id: 'c', name: 'Unplugged', state: 'disconnected' }],
    ]);
    expect(midiDevices({ inputs } as unknown as MIDIAccess)).toEqual([
      { id: 'a', label: 'Stage piano' },
      { id: 'b', label: 'MIDI input 2' },
    ]);
  });
  it('grades a chord whose keys arrive in any order, and a wrong key in it', () => {
    const chord = (tick: number, midis: number[]): ExpectedNote[] =>
      midis.map((midi) => ({ tick, midi, bar: 1, beatId: tick, eligible: true }));
    const targets = [...chord(0, [48, 52, 55]), ...chord(960, [50, 53, 57])];
    const key = (time: number, midi: number) => midiObservation(bytes(0x90, midi, 90), time)!;
    const played = [
      key(12, 55),
      key(4, 48),
      key(9, 52),
      key(1010, 57),
      key(1002, 54),
      key(1005, 50),
    ];
    const result = assess(targets, played, 60, 0, 0);
    expect(result.map((n) => n.status)).toEqual([
      'matched',
      'matched',
      'matched',
      'matched',
      'pitch',
      'matched',
    ]);
    expect(result[4].heard).toBe(54);
  });
});
