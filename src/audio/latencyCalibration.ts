import { TransientDetector } from './transients';

export const CALIBRATION_BPM = 90;
export const EIGHTH_SECONDS = 30 / CALIBRATION_BPM;
export const CALIBRATION_NOTES = 32;
export const CALIBRATION_LEAD = 0.2;
export const calibrationPattern = Array.from(
  { length: CALIBRATION_NOTES },
  (_, i) => CALIBRATION_LEAD + i * EIGHTH_SECONDS,
);

export interface LatencyEstimate {
  offsetMs: number;
  jitterMs: number;
  matched: number;
  reliable: boolean;
  reason: string;
  transients: number[];
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Short RMS windows find attacks without requiring a pitched note. */
export function detectTransients(samples: Float32Array, sampleRate: number): number[] {
  const window = Math.max(1, Math.round(sampleRate * 0.002));
  const envelope: number[] = [];
  for (let i = 0; i < samples.length; i += window) {
    let power = 0;
    for (let j = i; j < Math.min(i + window, samples.length); j++) power += samples[j] ** 2;
    envelope.push(Math.sqrt(power / window));
  }
  const peak = envelope.reduce((maximum, value) => Math.max(maximum, value), 0);
  const noise = [...envelope].sort((a, b) => a - b)[Math.floor(envelope.length * 0.2)] ?? 0;
  const threshold = Math.max(0.008, peak * 0.04, noise * 3);
  const hits: number[] = [];
  const detector = new TransientDetector(threshold);
  for (let i = 0; i < envelope.length; i++) {
    const level = envelope[i];
    const seconds = (i * window) / sampleRate;
    if (detector.observe(level, seconds)) hits.push(seconds);
  }
  return hits;
}

/** Compare candidate offsets using ordered, one-to-one matches; misses never shift later notes. */
export function estimateLatency(transients: number[], clipped = false): LatencyEstimate {
  const heard = [...transients].filter(Number.isFinite).sort((a, b) => a - b);
  const candidates = new Set<number>();
  for (const attack of heard)
    for (const click of calibrationPattern) {
      const offset = attack - click;
      if (offset >= -0.15 && offset <= 0.5) candidates.add(Math.round(offset * 1000) / 1000);
    }
  const fits = [...candidates]
    .map((offset) => {
      const differences: number[] = [];
      let after = 0;
      for (const click of calibrationPattern) {
        let best = -1;
        let distance = 0.085;
        for (let i = after; i < heard.length && heard[i] <= click + offset + 0.085; i++) {
          const error = Math.abs(heard[i] - click - offset);
          if (error < distance) {
            distance = error;
            best = i;
          }
        }
        if (best >= 0) {
          differences.push(heard[best] - click);
          after = best + 1;
        }
      }
      const center = median(differences);
      const jitter = median(differences.map((value) => Math.abs(value - center))) * 1.4826;
      return { differences, center, jitter };
    })
    .sort(
      (a, b) =>
        b.differences.length - a.differences.length ||
        a.jitter - b.jitter ||
        Math.abs(a.center) - Math.abs(b.center),
    );
  const best = fits[0];
  const matched = best?.differences.length ?? 0;
  const offsetMs = Math.round((best?.center ?? 0) * 1000);
  const jitterMs = Math.round((best?.jitter ?? 0) * 1000);
  const drift = best
    ? Math.abs(median(best.differences.slice(-8)) - median(best.differences.slice(0, 8)))
    : Infinity;
  const ambiguous = fits.some(
    (fit) =>
      fit.differences.length === matched &&
      Math.abs(fit.center - (best?.center ?? 0)) > EIGHTH_SECONDS * 0.8 &&
      fit.jitter <= (best?.jitter ?? 0) + 0.005,
  );
  const reason = clipped
    ? 'The input clipped. Lower input gain and try again.'
    : matched < 24
      ? `Matched ${matched} of 32 attacks. Play a short note on every click and try again.`
      : ambiguous
        ? 'The first beat was unclear. Start on the first click after the count-in and try again.'
        : jitterMs > 35 || drift > 0.05
          ? 'The timing varied too much. Keep steady with the clicks and try again.'
          : 'A consistent offset was found.';
  return {
    offsetMs,
    jitterMs,
    matched,
    reliable: !clipped && matched >= 24 && !ambiguous && jitterMs <= 35 && drift <= 0.05,
    reason,
    transients: heard,
  };
}
