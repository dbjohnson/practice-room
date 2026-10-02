export interface MixEffects {
  /** Amounts run from 0 (bypassed) to 100 (strongest). */
  compression: number;
  reverb: number;
}

export const DEFAULT_MIX_EFFECTS: Readonly<MixEffects> = { compression: 30, reverb: 40 };
const amount = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0);

/** Linked stereo compression and a diffused room, without lookahead latency. */
export class PlaybackEffects {
  private envelope = 0;
  private attack: number;
  private release: number;
  private slew: number;
  private compression = DEFAULT_MIX_EFFECTS.compression / 100;
  private reverb = DEFAULT_MIX_EFFECTS.reverb / 100;
  private rooms: RoomDelay[];
  private diffusers: AllPassDelay[][];
  private highPass = [0, 0];
  private previousInput = [0, 0];
  private highPassDecay: number;
  private settings: MixEffects = { ...DEFAULT_MIX_EFFECTS };

  constructor(sampleRate: number) {
    this.attack = Math.exp(-1 / (sampleRate * 0.02));
    this.release = Math.exp(-1 / (sampleRate * 0.18));
    this.slew = 1 - Math.exp(-1 / (sampleRate * 0.02));
    this.highPassDecay = Math.exp((-2 * Math.PI * 180) / sampleRate);
    this.rooms = [0.0297, 0.0371, 0.0411, 0.0437].flatMap((seconds) =>
      [0, 0.0013].map((offset) => new RoomDelay(sampleRate, seconds + offset)),
    );
    this.diffusers = [0, 0.0007].map((offset) =>
      [0.005, 0.0017].map((seconds) => new AllPassDelay(sampleRate, seconds + offset)),
    );
    this.configure(this.settings);
    this.reset();
  }

  process(input: Float32Array): Float32Array {
    if (!this.settings.compression && !this.settings.reverb) return input;
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i += 2) {
      this.compression += this.slew * (this.settings.compression / 100 - this.compression);
      this.reverb += this.slew * (this.settings.reverb / 100 - this.reverb);
      const peak = Math.max(Math.abs(input[i]), Math.abs(input[i + 1]));
      const smoothing = peak > this.envelope ? this.attack : this.release;
      this.envelope = smoothing * this.envelope + (1 - smoothing) * peak;
      // Sweep to -44 dB / 12:1 with a 6 dB soft knee; retain the mix's headroom.
      const over = 20 * Math.log10(Math.max(1e-8, this.envelope)) + 24 + 20 * this.compression;
      const slope = 1 - 1 / (1 + 11 * this.compression);
      const reduction = over <= -3 ? 0 : slope * (over < 3 ? (over + 3) ** 2 / 12 : over);
      const gain = 10 ** (-reduction / 20);
      for (let channel = 0; channel < 2; channel++) {
        const dry = input[i + channel] * gain;
        let wet = 0;
        if (this.settings.reverb) {
          const high =
            this.highPassDecay * (this.highPass[channel] + dry - this.previousInput[channel]);
          this.previousInput[channel] = dry;
          this.highPass[channel] = high;
          for (let reflection = 0; reflection < 4; reflection++)
            wet += this.rooms[reflection * 2 + channel].process(high, this.slew) / 4;
          for (const diffuser of this.diffusers[channel]) wet = diffuser.process(wet);
        }
        // Trade some dry level for ambience rather than just stacking more gain.
        output[i + channel] = dry * (1 - 0.55 * this.reverb) + wet * 0.9 * this.reverb;
      }
    }
    return output;
  }

  configure(settings: MixEffects) {
    this.settings = { compression: amount(settings.compression), reverb: amount(settings.reverb) };
    // Bypass clears only that effect. Other changes glide without cutting off tails.
    if (!this.settings.compression) this.compression = this.envelope = 0;
    if (!this.settings.reverb) {
      this.reverb = 0;
      this.resetRoom();
    }
    const decay = 0.35 + 3.65 * (this.settings.reverb / 100) ** 1.4;
    this.rooms.forEach((room) => room.setDecay(decay));
  }

  reset() {
    this.envelope = 0;
    this.compression = this.settings.compression / 100;
    this.reverb = this.settings.reverb / 100;
    this.resetRoom();
  }

  private resetRoom() {
    this.highPass.fill(0);
    this.previousInput.fill(0);
    this.rooms.forEach((room) => room.reset());
    this.diffusers.flat().forEach((diffuser) => diffuser.reset());
  }
}

class RoomDelay {
  private samples: Float32Array;
  private index = 0;
  private damped = 0;
  private feedback = 0;
  private targetFeedback = 0;

  constructor(
    sampleRate: number,
    private seconds: number,
  ) {
    this.samples = new Float32Array(Math.round(sampleRate * seconds));
  }

  setDecay(seconds: number) {
    this.targetFeedback = 10 ** ((-3 * this.seconds) / seconds);
  }

  process(input: number, slew: number): number {
    this.feedback += slew * (this.targetFeedback - this.feedback);
    const reflected = this.samples[this.index];
    this.damped += 0.3 * (reflected - this.damped);
    this.samples[this.index] = input + this.damped * this.feedback;
    this.index = (this.index + 1) % this.samples.length;
    return reflected;
  }

  reset() {
    this.samples.fill(0);
    this.index = 0;
    this.damped = 0;
    this.feedback = this.targetFeedback;
  }
}

/** Unity-gain diffusion makes individual room echoes less distinct. */
class AllPassDelay {
  private samples: Float32Array;
  private index = 0;

  constructor(sampleRate: number, seconds: number) {
    this.samples = new Float32Array(Math.round(sampleRate * seconds));
  }

  process(input: number): number {
    const output = this.samples[this.index] - input * 0.5;
    this.samples[this.index] = input + output * 0.5;
    this.index = (this.index + 1) % this.samples.length;
    return output;
  }

  reset() {
    this.samples.fill(0);
    this.index = 0;
  }
}
