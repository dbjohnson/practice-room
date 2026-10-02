/** A short peak hold follows the envelope, rather than each cycle of a ringing string. */
export class TransientDetector {
  private peaks: number[] = [];
  private baseline = 0;
  private lastAttack = -Infinity;
  constructor(private readonly threshold = 0.008) {}

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
