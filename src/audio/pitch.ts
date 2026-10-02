export interface PitchEstimate {
  midi: number | null;
  confidence: number;
  rms: number;
}

const MIN_FREQUENCY = 30;
const MAX_FREQUENCY = 1400;
// A later peak must clearly beat an earlier one to be chosen, which keeps a strong
// overtone from winning while still rejecting the half-period of a weak fundamental.
const PEAK_RATIO = 0.93;
const MIN_CLARITY = 0.5;

// Normalized square difference (McLeod): 1 for a perfect period, robust to decay.
function clarity(x: Float32Array, lag: number): number {
  let dot = 0;
  let energy = 0;
  for (let i = 0, end = x.length - lag; i < end; i++) {
    const a = x[i];
    const b = x[i + lag];
    dot += a * b;
    energy += a * a + b * b;
  }
  return energy > 0 ? (2 * dot) / energy : 0;
}

// Pitch of a clean, isolated note. Polyphony is deliberately ungraded.
export function estimatePitch(samples: Float32Array, sampleRate: number): PitchEstimate {
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0)
    return { midi: null, confidence: 0, rms: 0 };
  let sum = 0;
  let energy = 0;
  for (const sample of samples) {
    sum += sample;
    energy += sample * sample;
  }
  const rms = Math.sqrt(energy / samples.length);
  if (rms < 0.008) return { midi: null, confidence: 0, rms };
  const mean = sum / samples.length;
  const centered = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) centered[i] = samples[i] - mean;
  if (rms * rms - mean * mean < 0.008 * 0.008) return { midi: null, confidence: 0, rms };

  // Search a decimated copy for the period, then refine it at the full rate.
  const factor = Math.max(1, Math.floor(sampleRate / 11000));
  const coarse = new Float32Array(Math.floor(centered.length / factor));
  for (let i = 0; i < coarse.length; i++) {
    let total = 0;
    for (let j = 0; j < factor; j++) total += centered[i * factor + j];
    coarse[i] = total / factor;
  }
  const rate = sampleRate / factor;
  // Start below the shortest period so the zero-lag lobe is never mistaken for a peak.
  const minLag = Math.max(2, Math.floor(rate / MAX_FREQUENCY / 2));
  const maxLag = Math.min(Math.floor(coarse.length / 2), Math.ceil(rate / MIN_FREQUENCY));
  const peaks: { lag: number; value: number }[] = [];
  let peak: { lag: number; value: number } | null = null;
  let armed = false;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const value = clarity(coarse, lag);
    if (value <= 0) {
      if (peak) peaks.push(peak);
      peak = null;
      armed = true;
    } else if (armed && (!peak || value > peak.value)) peak = { lag, value };
  }
  // A peak still rising at the search limit is not a confirmed period.
  if (peak && peak.lag < maxLag) peaks.push(peak);
  if (!peaks.length) return { midi: null, confidence: 0, rms };
  const highest = Math.max(...peaks.map((p) => p.value));
  const chosen = peaks.find((p) => p.value >= highest * PEAK_RATIO)!;
  if (chosen.value < MIN_CLARITY) return { midi: null, confidence: 0, rms };

  let bestLag = chosen.lag * factor;
  let best = -Infinity;
  const fullMax = Math.floor(centered.length / 2);
  for (
    let lag = Math.max(2, chosen.lag * factor - factor);
    lag <= Math.min(fullMax, chosen.lag * factor + factor);
    lag++
  ) {
    const value = clarity(centered, lag);
    if (value > best) {
      best = value;
      bestLag = lag;
    }
  }
  const left = clarity(centered, bestLag - 1);
  const right = clarity(centered, bestLag + 1);
  const denominator = left - 2 * best + right;
  const shift = denominator ? (0.5 * (left - right)) / denominator : 0;
  const frequency = sampleRate / (bestLag + Math.max(-1, Math.min(1, shift)));
  return {
    midi: 69 + 12 * Math.log2(frequency / 440),
    confidence: Math.max(0, Math.min(1, best)),
    rms,
  };
}
