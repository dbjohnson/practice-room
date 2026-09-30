import type { PitchEstimate } from './pitch';

export const tunings = [
  { id: 'chromatic', name: 'Chromatic', notes: [] as number[] },
  { id: 'guitar', name: 'Guitar · standard', notes: [40, 45, 50, 55, 59, 64] },
  { id: 'drop-d', name: 'Guitar · drop D', notes: [38, 45, 50, 55, 59, 64] },
  { id: 'bass', name: 'Bass · 4 strings', notes: [28, 33, 38, 43] },
  { id: 'bass-5', name: 'Bass · 5 strings', notes: [23, 28, 33, 38, 43] },
];

export function tunerReading(midi: number | null, target: number | null = null, reference = 440) {
  if (midi === null || !Number.isFinite(midi) || !Number.isFinite(reference) || reference <= 0)
    return null;
  const calibrated = midi - 12 * Math.log2(reference / 440);
  const note = target ?? Math.round(calibrated);
  const cents = Math.round((calibrated - note) * 100);
  return {
    note,
    cents,
    frequency: 440 * 2 ** ((midi - 69) / 12),
    direction: Math.abs(cents) <= 5 ? 'in-tune' : cents < 0 ? 'flat' : 'sharp',
  };
}

export class StablePitch {
  private values: number[] = [];
  update(pitch: PitchEstimate, clipped: boolean): number | null {
    if (pitch.midi === null || pitch.confidence < 0.92 || pitch.rms < 0.008 || clipped) {
      this.values = [];
      return null;
    }
    if (this.values.length && Math.abs(pitch.midi - this.values.at(-1)!) > 0.5) this.values = [];
    this.values.push(pitch.midi);
    this.values = this.values.slice(-5);
    if (this.values.length < 3) return null;
    return [...this.values].sort((a, b) => a - b)[Math.floor(this.values.length / 2)];
  }
}
