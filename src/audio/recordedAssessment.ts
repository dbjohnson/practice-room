import type { Observation } from '../domain/types';
import { detectTransients } from './latencyCalibration';
import { estimatePitch } from './pitch';

/** Locate attacks in PCM, then identify pitch without moving the attack timestamp. */
export function recordedObservations(samples: Float32Array, sampleRate: number): Observation[] {
  const attacks = detectTransients(samples, sampleRate);
  return attacks.map((time, index) => {
    const next = attacks[index + 1] ?? samples.length / sampleRate;
    const attack = samples.subarray(
      Math.round(time * sampleRate),
      Math.min(samples.length, Math.round(Math.min(next, time + 0.03) * sampleRate)),
    );
    const timingReliable = !attack.some((value) => Math.abs(value) >= 0.98);
    let best = { midi: null, confidence: 0, rms: 0 } as ReturnType<typeof estimatePitch>;
    for (const delay of [0.004, 0.02, 0.04]) {
      const start = Math.round((time + delay) * sampleRate);
      const end = Math.min(samples.length, Math.floor(next * sampleRate), start + 4096);
      if (end - start < sampleRate * 0.02) continue;
      const frame = samples.subarray(start, end);
      if (frame.some((value) => Math.abs(value) >= 0.98)) continue;
      const pitch = estimatePitch(frame, sampleRate);
      if (pitch.confidence > best.confidence || (best.rms === 0 && pitch.rms > 0)) best = pitch;
      if (best.midi !== null && best.confidence >= 0.95) break;
    }
    return { time, ...best, timingReliable };
  });
}

export async function analyseRecordedTake(blob: Blob): Promise<Observation[]> {
  const context = new OfflineAudioContext(1, 1, 48000);
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  return recordedObservations(decoded.getChannelData(0), decoded.sampleRate);
}
