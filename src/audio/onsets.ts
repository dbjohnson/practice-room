import type { Observation } from '../domain/types';
import type { PitchEstimate } from './pitch';

// An attack often arrives before enough periodic audio exists to identify its pitch.
// Keep that attack timestamp while waiting briefly for a stable pitch estimate.
export class OnsetTracker {
  private previousRms = 0;
  private lastMidi: number | null = null;
  private lastAttack = -Infinity;
  private pending: number | null = null;

  observe(pitch: PitchEstimate, time: number): Observation | null {
    const clear = pitch.midi !== null && pitch.confidence >= 0.88 && pitch.rms < 0.8;
    const midi = clear ? Math.round(pitch.midi!) : null;
    const attack = pitch.rms > 0.012 && pitch.rms > this.previousRms * 1.3;
    const changed = midi !== null && midi !== this.lastMidi;
    if (this.pending === null && (attack || changed) && time - this.lastAttack > 0.12) {
      this.pending = time;
      this.lastAttack = time;
    }
    this.previousRms = pitch.rms;
    if (midi !== null || pitch.rms < 0.008) this.lastMidi = midi;
    if (this.pending === null) return null;
    if (clear || time - this.pending >= 0.18) {
      const observation = { time: this.pending, ...pitch };
      this.pending = null;
      return observation;
    }
    return null;
  }
}
