import { useCallback, useState } from 'react';
import type { AlphaTabApi } from '@coderline/alphatab';
import type { InputStatus, Observation } from '../domain/types';
import {
  loopbackLatency,
  playClicks,
  playerContext,
  reportedOutputLatency,
  type KnownLatency,
} from '../audio/latency';
import { usePersistentState } from '../storage/usePersistentState';

export interface Calibration {
  /** The interface and channel the cable was plugged into. */
  deviceId: string;
  channel: number;
  ms: number;
  measuredAt: string;
}
const isCalibration = (value: unknown) =>
  value === null ||
  (typeof (value as Calibration).deviceId === 'string' &&
    Number.isInteger((value as Calibration).channel) &&
    Number.isFinite((value as Calibration).ms));

interface LatencyOptions {
  api: React.RefObject<AlphaTabApi | null>;
  status: InputStatus;
  observe: (handler: (observation: Observation) => void) => () => void;
  notify: (message: string) => void;
}

// The delay between the band being rendered and a played note being detected. A loopback
// measurement for the connected interface wins; otherwise the browser's own figures.
export function useLatency({ api, status, observe, notify }: LatencyOptions) {
  const [calibration, setCalibration] = usePersistentState<Calibration | null>(
    'latency',
    null,
    isCalibration,
  );
  const [measuring, setMeasuring] = useState(false);
  const measured =
    calibration &&
    status.state === 'ready' &&
    calibration.deviceId === status.deviceId &&
    calibration.channel === status.channel
      ? calibration
      : null;
  const known = useCallback((): KnownLatency | null => {
    if (measured) return { ms: measured.ms, source: 'measured' };
    const output = reportedOutputLatency(playerContext(api.current));
    const ms = Math.round(output * 1000) + status.latencyMs;
    return ms > 0 ? { ms, source: 'reported' } : null;
  }, [api, measured, status.latencyMs]);
  const measure = useCallback(async () => {
    const context = playerContext(api.current);
    if (!context || status.state !== 'ready') {
      notify('Connect your interface and wait for the instruments to load, then measure again.');
      return;
    }
    setMeasuring(true);
    const attacks: number[] = [];
    const stop = observe((observation) => attacks.push(observation.time));
    try {
      await context.resume();
      const clicks = playClicks(context);
      await new Promise((resolve) => window.setTimeout(resolve, clicks.seconds * 1000));
      const seconds = loopbackLatency(clicks.times, attacks);
      if (seconds === null) {
        notify(
          'The clicks did not come back clearly. Check the cable, input channel and level, then try again.',
        );
        return;
      }
      const ms = Math.round(seconds * 1000);
      setCalibration({
        deviceId: status.deviceId,
        channel: status.channel,
        ms,
        measuredAt: new Date().toISOString(),
      });
      notify(`Measured ${ms} ms. Takes on this interface and channel now use it.`);
    } finally {
      stop();
      setMeasuring(false);
    }
  }, [api, status.state, status.deviceId, status.channel, observe, notify, setCalibration]);
  const forget = useCallback(() => setCalibration(null), [setCalibration]);
  return { known, measured, measuring, measure, forget };
}
