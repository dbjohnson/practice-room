import type { Observation } from '../domain/types';

export interface MidiDevice {
  id: string;
  label: string;
}

/**
 * A played note from a raw MIDI message, or null for anything else. MIDI reports the
 * exact key and the moment it was struck, so there is nothing to estimate.
 */
export function midiObservation(data: Uint8Array | null, timeStamp: number): Observation | null {
  if (!data || data.length < 3) return null;
  const velocity = data[2];
  // A note-on with velocity zero is a note-off.
  if ((data[0] & 0xf0) !== 0x90 || velocity === 0) return null;
  return {
    time: timeStamp / 1000,
    midi: data[1],
    confidence: 1,
    // Stands in for loudness; kept inside the range the matcher treats as healthy.
    rms: 0.05 + (velocity / 127) * 0.6,
  };
}

export function midiDevices(access: MIDIAccess): MidiDevice[] {
  return [...access.inputs.values()]
    .filter((input) => input.state !== 'disconnected')
    .map((input, i) => ({ id: input.id, label: input.name || `MIDI input ${i + 1}` }));
}

export function midiAccessError(error: unknown): string {
  if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name))
    return 'MIDI access was not granted. Allow MIDI devices in your browser’s site settings, then try again.';
  return error instanceof Error ? error.message : 'Could not access MIDI devices.';
}

export function requestMidi(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess)
    throw new Error('This browser has no MIDI support. Try Chrome, Edge or Firefox over HTTPS.');
  return navigator.requestMIDIAccess();
}
