export interface SynthNote {
  time: number;
  midi: number;
  amplitude?: number;
  /** Change pitch without a new pick attack, as a hammer-on would. */
  legato?: boolean;
  /** Keep sounding under later notes, as when crossing to another string. */
  ring?: boolean;
}

function noise(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  };
}

// A monophonic plucked-string line: decaying harmonics with a short, bright pick
// transient. Each note stops the previous one, as on a single string.
export function renderLine(notes: SynthNote[], sampleRate: number, seconds: number, hiss = 0) {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const random = noise(7);
  notes.forEach((note, index) => {
    const frequency = 440 * 2 ** ((note.midi - 69) / 12);
    const amplitude = note.amplitude ?? 0.3;
    const start = Math.round(note.time * sampleRate);
    const end =
      notes[index + 1] && !note.ring
        ? Math.min(out.length, Math.round(notes[index + 1].time * sampleRate))
        : out.length;
    // A legato note inherits the level its predecessor has decayed to.
    const age = note.legato && index > 0 ? note.time - notes[index - 1].time : 0;
    const harmonics = Math.max(1, Math.min(10, Math.floor(sampleRate / 2.5 / frequency)));
    for (let i = start; i < end; i++) {
      const t = (i - start) / sampleRate;
      let value = 0;
      for (let k = 1; k <= harmonics; k++)
        value +=
          (Math.sin(2 * Math.PI * frequency * k * t + k) / k) *
          Math.exp(-(t + age) * (1.2 + 0.9 * k));
      if (!note.legato && t < 0.004) value += random() * 0.8 * (1 - t / 0.004);
      const attack = note.legato ? 1 : Math.min(1, t / 0.002);
      const release = Math.min(1, (end - i) / (0.004 * sampleRate));
      out[i] +=
        amplitude * 0.6 * value * attack * (notes[index + 1]?.legato || note.ring ? 1 : release);
    }
  });
  if (hiss) for (let i = 0; i < out.length; i++) out[i] += hiss * random();
  return out;
}
