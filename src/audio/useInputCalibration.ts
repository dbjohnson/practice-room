import { useState, type RefObject } from 'react';
import { readLocal, writeLocal } from '../storage/library';
import { runLatencyCalibration } from './runLatencyCalibration';
import type { LatencyEstimate } from './latencyCalibration';
import type { openInstrumentCapture } from './instrumentCapture';

type Capture = Awaited<ReturnType<typeof openInstrumentCapture>>;
interface Profile {
  key: string;
  offsetMs: number;
  jitterMs: number;
  matched: number;
  createdAt: string;
}
export interface CalibrationResult extends LatencyEstimate {
  key: string;
}

export function useInputCalibration(
  resources: RefObject<{ capture: Capture } | null>,
  channel: number,
) {
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const stored = readLocal<Profile[]>('input-calibrations', []);
    return Array.isArray(stored)
      ? stored.filter(
          (p) =>
            p &&
            typeof p.key === 'string' &&
            Number.isFinite(p.offsetMs) &&
            p.offsetMs >= -150 &&
            p.offsetMs <= 500,
        )
      : [];
  });
  const capture = resources.current?.capture;
  // Final grading now uses recorded transients too; require a fresh calibration for this pipeline.
  const key = capture
    ? `${capture.deviceId}:${channel}:${capture.context.sampleRate}:recorded-v2`
    : '';
  const calibration = profiles.find((profile) => profile.key === key) ?? null;
  const calibrate = async (
    signal: AbortSignal,
    progress: (note: number) => void,
  ): Promise<CalibrationResult> => {
    if (!capture) throw new Error('Connect your interface before calibrating.');
    // Always measure the raw recording. Saved offsets belong only to take grading.
    const result = await runLatencyCalibration(capture.context, capture.analyser, signal, progress);
    return { ...result, key };
  };
  const saveCalibration = (result: CalibrationResult | null) => {
    if (result && (!result.reliable || result.key !== key)) return;
    const next = profiles.filter((profile) => profile.key !== key);
    if (result)
      next.unshift({
        key,
        offsetMs: result.offsetMs,
        jitterMs: result.jitterMs,
        matched: result.matched,
        createdAt: new Date().toISOString(),
      });
    setProfiles(next.slice(0, 16));
    writeLocal('input-calibrations', next.slice(0, 16));
  };
  return { calibration, calibrationKey: key, calibrate, saveCalibration };
}
