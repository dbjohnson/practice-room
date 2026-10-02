import { useCallback, useEffect, useRef, useState } from 'react';
import type { Observation } from '../domain/types';
import {
  midiAccessError,
  midiDevices,
  midiObservation,
  requestMidi,
  type MidiDevice,
} from './midiInput';
import { createStore } from './store';

export interface MidiStatus {
  state: 'off' | 'connecting' | 'ready' | 'error';
  deviceId: string;
  deviceLabel: string;
  error: string | null;
}
const initial: MidiStatus = { state: 'off', deviceId: '', deviceLabel: '', error: null };

// A keyboard, e-drum kit or MIDI guitar as the instrument for recorded takes.
export function useMidiInput(onObservation: (observation: Observation) => void) {
  const [status, setStatus] = useState<MidiStatus>(initial);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [lastNote] = useState(() => createStore<number | null>(null));
  const latest = useRef(onObservation);
  latest.current = onObservation;
  const access = useRef<MIDIAccess | null>(null);
  const port = useRef<MIDIInput | null>(null);
  const generation = useRef(0);
  const release = useCallback(() => {
    if (port.current) port.current.onmidimessage = null;
    port.current = null;
    lastNote.set(null);
  }, [lastNote]);
  const stop = useCallback(() => {
    generation.current++;
    release();
    setStatus(initial);
  }, [release]);
  const discover = useCallback(async () => {
    try {
      const granted = access.current ?? (await requestMidi());
      access.current = granted;
      setAuthorized(true);
      setDevices(midiDevices(granted));
      granted.onstatechange = () => {
        setDevices(midiDevices(granted));
        const current = port.current;
        if (current && current.state === 'disconnected') {
          generation.current++;
          release();
          setStatus({
            ...initial,
            state: 'error',
            error: 'Your MIDI instrument disconnected. Check its cable, then reconnect below.',
          });
        }
      };
      return granted;
    } catch (error) {
      setStatus({ ...initial, state: 'error', error: midiAccessError(error) });
      return null;
    }
  }, [release]);
  const start = useCallback(
    async (deviceId: string) => {
      const token = ++generation.current;
      release();
      setStatus({ ...initial, state: 'connecting' });
      const granted = await discover();
      if (token !== generation.current || !granted) return;
      const input = granted.inputs.get(deviceId);
      if (!input || input.state === 'disconnected') {
        setStatus({
          ...initial,
          state: 'error',
          error: 'That MIDI instrument is no longer available. Choose it again.',
        });
        return;
      }
      input.onmidimessage = (event) => {
        const observation = midiObservation(event.data, event.timeStamp);
        if (!observation) return;
        lastNote.set(observation.midi);
        latest.current(observation);
      };
      port.current = input;
      setStatus({
        state: 'ready',
        deviceId: input.id,
        deviceLabel: input.name || 'MIDI instrument',
        error: null,
      });
    },
    [discover, release, lastNote],
  );
  useEffect(
    () => () => {
      generation.current++;
      release();
      if (access.current) access.current.onstatechange = null;
    },
    [release],
  );
  return { status, devices, authorized, lastNote, discover, start, stop };
}
