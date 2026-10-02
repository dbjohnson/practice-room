import type { Observation } from '../domain/types';
import { CLIP_PEAK } from './inputLevels';
import { estimatePitch, type PitchEstimate } from './pitch';
import { TransientDetector } from './transients';

export interface InputFrame extends PitchEstimate {
  time: number;
  peak: number;
  clipped: boolean;
}

const FLOOR_RMS = 0.012;
const CLEAR = 0.88;
const REFRACTORY = 0.06;
const RESOLVE_TIMEOUT = 0.2;
/** Level is measured every 2 ms; brightness over three of those windows. */
const FINE_PER_COARSE = 3;
const HISTORY = 32;
const LOOKBACK = 9;
/** Pitch is re-read every 20 ms; level and tuner frames go out every 40 ms. */
const FINE_PER_ANALYSIS = 10;
const FINE_PER_FRAME = 20;

interface Pending {
  time: number;
  start: number;
  last: PitchEstimate | null;
  /** Found by brightness alone: real only if a note follows. */
  byBrightness: boolean;
}

// Streaming note detector for one clean instrument channel. Attacks come from two cues:
// a jump in level, found by the same transient detector that grades recorded takes, and
// a jump in brightness, which catches a string re-picked while it is still ringing.
// Each note's pitch is read only from audio after its attack, so the previous ringing
// note cannot be reported instead.
export class InputAnalyzer {
  private readonly step: number;
  private readonly window: Float32Array;
  // Brightness per 6 ms, newest at `coarse - 1`, kept for about 190 ms.
  private readonly brightness = new Float32Array(HISTORY);
  private readonly transients = new TransientDetector();
  private position = 0;
  private filled = 0;
  private stepCount = 0;
  private stepEnergy = 0;
  private stepFlux = 0;
  private coarseEnergy = 0;
  private coarseFlux = 0;
  private previousSample = 0;
  private fine = 0;
  private coarse = 0;
  private level = 0;
  private loudest = 0;
  private framePeak = 0;
  private lastOnset = -Infinity;
  private clipUntil = -Infinity;
  private pending: Pending | null = null;
  private note: number | null = null;
  private candidate: { midi: number; time: number; frames: number } | null = null;

  constructor(
    private readonly sampleRate: number,
    private readonly onFrame: (frame: InputFrame) => void,
    private readonly onObservation: (observation: Observation) => void,
  ) {
    this.step = Math.max(1, Math.round(sampleRate * 0.002));
    this.window = new Float32Array(Math.ceil(sampleRate * 0.085));
  }

  /** `time` is the clock time, in seconds, of the first sample. */
  push(samples: Float32Array, time: number) {
    const size = this.window.length;
    for (let offset = 0; offset < samples.length;) {
      const count = Math.min(this.step - this.stepCount, samples.length - offset);
      for (let i = offset; i < offset + count; i++) {
        const sample = samples[i];
        const difference = sample - this.previousSample;
        this.previousSample = sample;
        this.stepEnergy += sample * sample;
        this.stepFlux += difference * difference;
        const magnitude = sample < 0 ? -sample : sample;
        if (magnitude > this.framePeak) this.framePeak = magnitude;
      }
      if (count >= size) this.window.set(samples.subarray(offset + count - size, offset + count));
      else {
        this.window.copyWithin(0, count);
        this.window.set(samples.subarray(offset, offset + count), size - count);
      }
      this.filled = Math.min(size, this.filled + count);
      this.position += count;
      this.stepCount += count;
      offset += count;
      if (this.stepCount === this.step) this.endStep(time + offset / this.sampleRate);
    }
  }

  private endStep(now: number) {
    const seconds = this.step / this.sampleRate;
    this.level = Math.sqrt(this.stepEnergy / this.step);
    // Quiet playing still counts: the threshold follows the loudest recent level.
    this.loudest = Math.max(this.level, this.loudest * 0.9999);
    this.transients.threshold = Math.max(0.008, this.loudest * 0.04);
    let attack = this.transients.observe(this.level, now - seconds) ? now - seconds : null;
    let byBrightness = false;
    this.coarseEnergy += this.stepEnergy;
    this.coarseFlux += this.stepFlux;
    this.stepCount = 0;
    this.stepEnergy = 0;
    this.stepFlux = 0;
    this.fine++;
    if (this.fine % FINE_PER_COARSE === 0) {
      // Brightness: energy of the sample-to-sample change relative to the level. A pick
      // or hammer re-excites the upper harmonics even when the note is no louder.
      const bright = this.coarseEnergy > 0 ? this.coarseFlux / this.coarseEnergy : 0;
      const rms = Math.sqrt(this.coarseEnergy / (this.step * FINE_PER_COARSE));
      let brightest = 0;
      for (let back = 1; back <= Math.min(LOOKBACK, this.coarse); back++)
        brightest = Math.max(brightest, this.brightness[(this.coarse - back) % HISTORY]);
      if (attack === null && this.coarse >= LOOKBACK && rms > FLOOR_RMS && bright > brightest * 3) {
        attack = now - seconds * FINE_PER_COARSE;
        byBrightness = true;
      }
      this.brightness[this.coarse % HISTORY] = bright;
      this.coarse++;
      this.coarseEnergy = 0;
      this.coarseFlux = 0;
    }
    if (attack !== null && attack - this.lastOnset > REFRACTORY) {
      if (this.pending) this.resolve(this.pending.last);
      const start = this.position - Math.round((now - attack) * this.sampleRate);
      this.pending = { time: attack, start, last: null, byBrightness };
      this.lastOnset = attack;
      this.candidate = null;
    }
    if (this.fine % FINE_PER_ANALYSIS === 0) this.analyze(now);
  }

  private recent(length: number) {
    return this.window.subarray(this.window.length - Math.min(length, this.filled));
  }

  private analyze(now: number) {
    if (this.framePeak >= CLIP_PEAK) this.clipUntil = now + 1;
    const clipped = now < this.clipUntil;
    const frame = estimatePitch(this.recent(this.window.length), this.sampleRate);
    const pending = this.pending;
    if (pending) {
      // Skip the pick transient, then listen only to this note.
      const available = this.position - pending.start - Math.round(this.sampleRate * 0.008);
      if (available >= this.sampleRate * 0.03) {
        const estimate = estimatePitch(this.recent(available), this.sampleRate);
        if (estimate.midi !== null && estimate.confidence >= CLEAR) {
          if (pending.last?.midi != null && Math.abs(estimate.midi - pending.last.midi) < 0.5)
            this.resolve(estimate);
          else pending.last = estimate;
        }
        if (this.pending && now - pending.time >= RESOLVE_TIMEOUT)
          this.resolve(pending.last ?? { ...estimate, midi: null, confidence: 0 });
      }
    } else this.followLegato(frame, now);
    if (this.fine % FINE_PER_FRAME === 0) {
      this.onFrame({ ...frame, time: now, peak: this.framePeak, clipped });
      this.framePeak = 0;
    }
  }

  // Hammer-ons, pull-offs and slides change pitch without a new attack.
  private followLegato(frame: PitchEstimate, now: number) {
    if (frame.rms < 0.008) {
      this.note = null;
      this.candidate = null;
      return;
    }
    if (frame.midi === null || frame.confidence < CLEAR) return;
    const midi = Math.round(frame.midi);
    if (this.note === null || midi === this.note) {
      if (this.note === null) this.note = midi;
      this.candidate = null;
      return;
    }
    if (this.candidate?.midi !== midi) {
      this.candidate = { midi, time: now, frames: 1 };
      return;
    }
    // A pitch estimate can flicker by an octave on a ringing string, so an octave move
    // must hold for longer before it counts as a new note.
    this.candidate.frames++;
    if (this.candidate.frames < ((midi - this.note) % 12 === 0 ? 4 : 2)) return;
    // The window reports a new pitch once that note fills about half of it. A quiet
    // pick or hammer inside the window still brightens the signal; prefer its time.
    const seconds = (this.step * FINE_PER_COARSE) / this.sampleRate;
    const span = this.window.length / this.sampleRate;
    const latest = now - ((this.fine % FINE_PER_COARSE) * this.step) / this.sampleRate;
    // Allow also for the 20 ms between pitch readings.
    let time = this.candidate.time - span / 2 - 0.02;
    let sharpest = 3;
    for (let back = 1; back < Math.min(HISTORY, this.coarse) - 1; back++) {
      const start = latest - back * seconds;
      if (start > this.candidate.time || start < this.candidate.time - span - 0.02) continue;
      const i = (this.coarse - back) % HISTORY;
      const rise = this.brightness[i] / (this.brightness[(i + HISTORY - 1) % HISTORY] || 1e-12);
      if (rise > sharpest) {
        sharpest = rise;
        time = start;
      }
    }
    this.candidate = null;
    if (time - this.lastOnset <= REFRACTORY) return;
    this.lastOnset = time;
    this.note = midi;
    this.emit(time, frame, now);
  }

  private resolve(estimate: PitchEstimate | null) {
    const pending = this.pending!;
    this.pending = null;
    // A note being released also brightens as it fades; with no pitch after it, that
    // was not an attack. A jump in level is kept even unpitched, as a muted note is.
    if (pending.byBrightness && (estimate?.midi ?? null) === null) return;
    const result = estimate ?? { midi: null, confidence: 0, rms: this.level };
    this.note = result.midi === null ? null : Math.round(result.midi);
    this.emit(pending.time, result, pending.time);
  }

  private emit(time: number, estimate: PitchEstimate, now: number) {
    const clipped = now < this.clipUntil || this.framePeak >= CLIP_PEAK;
    this.onObservation({
      time,
      midi: estimate.midi,
      confidence: clipped ? 0 : estimate.confidence,
      rms: estimate.rms,
    });
  }
}
