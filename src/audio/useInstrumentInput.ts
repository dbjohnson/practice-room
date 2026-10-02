import { useCallback, useEffect, useRef, useState } from 'react';
import type { InputStatus, Observation } from '../domain/types';
import { audioAccessError } from './audioDevices';
import { openInstrumentCapture } from './instrumentCapture';
import { measureInput } from './inputLevels';
import { OnsetTracker } from './onsets';
import { estimatePitch } from './pitch';
import { StablePitch } from './tuner';
import { useInputCalibration } from './useInputCalibration';
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
    timer: number;
    tracker: OnsetTracker;
    stable: StablePitch;
    clipUntil: number;
    ended: () => void;
  } | null>(null);
  const generation = useRef(0);
  const release = useCallback(() => {
    const current = resources.current;
    resources.current = null;
    if (current) {
      window.clearInterval(current.timer);
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
        const current = {
          capture,
          timer: 0,
          tracker: new OnsetTracker(),
          stable: new StablePitch(),
          clipUntil: 0,
          ended,
        };
        resources.current = current;
        const channel = Math.max(0, Math.min(capture.channelCount - 1, preferredChannel));
        capture.selectChannel(channel);
        capture.setGain(gainRef.current);
        writeLocal('input-connection', { deviceId: capture.deviceId, channel });
        const buffer = new Float32Array(capture.analyser.fftSize);
        setStatus({
          ...initial,
          state: 'ready',
          deviceId: capture.deviceId,
          deviceLabel: capture.label,
          channelCount: capture.channelCount,
          channel,
        });
        let lastMeterUpdate = -Infinity;
        current.timer = window.setInterval(() => {
          capture.analyser.getFloatTimeDomainData(buffer);
          const pitch = estimatePitch(buffer, capture.context.sampleRate);
          const levels = measureInput(buffer);
          const now = performance.now() / 1000;
          if (levels.clipped) current.clipUntil = now + 1;
          const clipped = now < current.clipUntil;
          const observation = current.tracker.observe(
            clipped ? { ...pitch, confidence: 0 } : pitch,
            now - buffer.length / capture.context.sampleRate / 2,
          );
          if (observation) latest.current(observation);
          const tunerMidi = current.stable.update(pitch, clipped);
          if (now - lastMeterUpdate < 0.1) return;
          lastMeterUpdate = now;
          setStatus((previous) => ({
            ...previous,
            peakDb: levels.peakDb,
            clipped,
            midi: pitch.midi,
            tunerMidi,
            confidence: pitch.confidence,
          }));
        }, 45);
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
    current.tracker = new OnsetTracker();
    current.stable = new StablePitch();
    current.clipUntil = 0;
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
  const calibration = useInputCalibration(resources, status.channel);
  return { status, start, stop, selectChannel, record, gain, setGain, ...calibration };
}
