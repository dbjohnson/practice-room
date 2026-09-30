export interface PitchEstimate {
  midi: number | null;
  confidence: number;
  rms: number;
}

// Normalized autocorrelation for clean, isolated notes. Polyphony is deliberately ungraded.
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
  const minLag = Math.max(2, Math.floor(sampleRate / 1400));
  const maxLag = Math.min(Math.floor(samples.length / 2), Math.ceil(sampleRate / 30));
  const correlation = (lag: number) => {
    let dot = 0;
    let aEnergy = 0;
    let bEnergy = 0;
    for (let i = 0; i < samples.length - maxLag; i += 2) {
      const a = samples[i] - mean;
      const b = samples[i + lag] - mean;
      dot += a * b;
      aEnergy += a * a;
      bEnergy += b * b;
    }
    return dot / Math.sqrt(aEnergy * bEnergy || 1);
  };
  let bestLag = -1;
  let best = 0;
  let previous = correlation(minLag);
  let rising = false;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    const current = correlation(lag);
    if (current < previous && rising && previous > 0.88) {
      bestLag = lag - 1;
      best = previous;
      break;
    }
    rising = current > previous;
    previous = current;
  }
  if (bestLag < 0) return { midi: null, confidence: 0, rms };
  const left = correlation(bestLag - 1);
  const right = correlation(bestLag + 1);
  const denominator = left - 2 * best + right;
  const shift = denominator ? (0.5 * (left - right)) / denominator : 0;
  const frequency = sampleRate / (bestLag + shift);
  return { midi: 69 + 12 * Math.log2(frequency / 440), confidence: Math.min(1, best), rms };
}
