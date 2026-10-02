import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputStatus, Observation } from '../domain/types';
import { audioAccessError } from './audioDevices';
import { openInstrumentCapture } from './instrumentCapture';
import { amplitudeToDb } from './inputLevels';
import { StablePitch } from './tuner';
import { recordInstrument } from './recordInstrument';
import { readLocal, writeLocal } from '../storage/library';

interface RememberedInput {
  deviceId: string;
  channel: number;
}
const rememberedInput = () => readLocal<RememberedInput | null>('input-connection', null);

const initial: InputStatus = {
  state: 'off',
  peakDb: -60,
  clipped: false,
  midi: null,
  tunerMidi: null,
  confidence: 0,
  error: null,
  deviceId: '',
  deviceLabel: '',
  channelCount: 0,
  channel: 0,
  latencyMs: 0,
};
type Capture = Awaited<ReturnType<typeof openInstrumentCapture>>;

export function useInstrumentInput(onObservation: (observation: Observation) => void) {
  const [status, setStatus] = useState<InputStatus>(initial);
  const [gain, setGainState] = useState(() => {
    const saved = readLocal<number>('input-gain', 0);
    return Number.isFinite(saved) ? Math.max(-24, Math.min(12, saved)) : 0;
  });
  const gainRef = useRef(gain);
  const latest = useRef(onObservation);
  latest.current = onObservation;
  const resources = useRef<{
    capture: Capture;
    stable: StablePitch;
    ended: () => void;
  } | null>(null);
  const generation = useRef(0);
  const observers = useRef(new Set<(observation: Observation) => void>());
  /** Also receive detected notes until the returned function is called. */
  const observe = useCallback((handler: (observation: Observation) => void) => {
    observers.current.add(handler);
    return () => void observers.current.delete(handler);
  }, []);
  const release = useCallback(() => {
    const current = resources.current;
    resources.current = null;
    if (current) {
      current.capture.track.removeEventListener('ended', current.ended);
      current.capture.close();
    }
  }, []);
  const stop = useCallback(() => {
    writeLocal('input-connection', null);
    generation.current++;
    release();
    setStatus(initial);
  }, [release]);
  const start = useCallback(
    async (deviceId: string, preferredChannel = 0) => {
      const token = ++generation.current;
      release();
      setStatus({ ...initial, state: 'connecting' });
      try {
        const capture = await openInstrumentCapture(deviceId, () => token === generation.current);
        if (token !== generation.current) {
          capture.close();
          return;
        }
        const ended = () => {
          if (token !== generation.current) return;
          generation.current++;
          release();
          setStatus({
            ...initial,
            state: 'error',
            error: 'Your audio interface disconnected. Check its cable, then reconnect below.',
          });
        };
        capture.track.addEventListener('ended', ended);
        const current = { capture, stable: new StablePitch(), ended };
        resources.current = current;
        const channel = Math.max(0, Math.min(capture.channelCount - 1, preferredChannel));
        capture.selectChannel(channel);
        capture.setGain(gainRef.current);
        writeLocal('input-connection', { deviceId: capture.deviceId, channel });
        setStatus({
          ...initial,
          state: 'ready',
          deviceId: capture.deviceId,
          deviceLabel: capture.label,
          channelCount: capture.channelCount,
          channel,
          latencyMs: Math.round(capture.inputLatency * 1000),
        });
        let lastMeterUpdate = -Infinity;
        let peak = 0;
        // Notes are detected on the audio thread; the meter and tuner follow at 10 Hz.
        capture.listen((message) => {
          if (message.type === 'observation') {
            latest.current(message.observation);
            observers.current.forEach((handler) => handler(message.observation));
            return;
          }
          const { frame } = message;
          peak = Math.max(peak, frame.peak);
          const tunerMidi = current.stable.update(frame, frame.clipped);
          if (frame.time - lastMeterUpdate < 0.1) return;
          lastMeterUpdate = frame.time;
          const peakDb = amplitudeToDb(peak);
          peak = 0;
          setStatus((previous) => ({
            ...previous,
            peakDb,
            clipped: frame.clipped,
            midi: frame.midi,
            tunerMidi,
            confidence: frame.confidence,
          }));
        });
      } catch (error) {
        if (token === generation.current)
          setStatus({ ...initial, state: 'error', error: audioAccessError(error) });
      }
    },
    [release],
  );
  const selectChannel = useCallback((channel: number) => {
    const current = resources.current;
    if (!current) return;
    current.capture.selectChannel(channel);
    writeLocal('input-connection', { deviceId: current.capture.deviceId, channel });
    current.stable = new StablePitch();
    setStatus((previous) => ({
      ...previous,
      channel,
      peakDb: -60,
      clipped: false,
      midi: null,
      tunerMidi: null,
      confidence: 0,
    }));
  }, []);
  useEffect(() => {
    let cancelled = false;
    const token = generation.current;
    const saved = rememberedInput();
    if (saved && typeof saved.deviceId === 'string' && Number.isInteger(saved.channel)) {
      void (async () => {
        let granted: boolean;
        try {
          granted =
            (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state ===
            'granted';
        } catch {
          const devices = await navigator.mediaDevices?.enumerateDevices();
          granted = !!devices?.some((device) => device.deviceId === saved.deviceId && device.label);
        }
        if (granted && !cancelled && token === generation.current)
          await start(saved.deviceId, saved.channel);
      })().catch(() => {});
    }
    return () => {
      cancelled = true;
      generation.current++;
      release();
    };
  }, [release, start]);
  const record = useCallback((onPeak: (peak: number) => void) => {
    const capture = resources.current?.capture;
    if (!capture) throw new Error('Connect your audio interface before recording.');
    return recordInstrument(capture.context, capture.analyser, onPeak);
  }, []);
  const setGain = (db: number) => {
    if (!Number.isFinite(db)) return;
    const value = Math.max(-24, Math.min(12, db));
    gainRef.current = value;
    resources.current?.capture.setGain(value);
    setGainState(value);
    writeLocal('input-gain', value);
  };
  return { status, start, stop, selectChannel, record, gain, setGain, observe };
}
