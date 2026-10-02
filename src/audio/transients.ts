/** A short peak hold follows the envelope, rather than each cycle of a ringing string. */
export class TransientDetector {
  private peaks: number[] = [];
  private baseline = 0;
  private lastAttack = -Infinity;
  constructor(public threshold = 0.008) {}

  observe(rms: number, time: number): boolean {
    this.peaks.push(rms);
    if (this.peaks.length > 10) this.peaks.shift(); // Ten 2 ms windows cover low bass periods.
    const level = Math.max(...this.peaks);
    const attack =
      rms >= level &&
      level > this.threshold &&
      level > this.baseline * 1.7 &&
      level - this.baseline > this.threshold &&
      time - this.lastAttack > 0.06;
    this.baseline += 0.08 * (level - this.baseline);
    if (attack) this.lastAttack = time;
    return attack;
  }
}

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
