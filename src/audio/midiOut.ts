import { midi, type model } from '@coderline/alphatab';

/** The notes of a score before any playback shaping: swing, dynamics and repeats included. */
export function scoreEvents(score: model.Score): OutEvent[] {
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(score, null, new midi.AlphaSynthMidiFileHandler(file)).generate();
  return fileEvents(file);
}

/** Where a track's notes are sent instead of the built-in sampled instrument. */
export interface MidiRoute {
  outputId: string;
  /** 1–16, as instrument plugins show it. */
  channel: number;
}
export interface OutEvent {
  tick: number;
  track: number;
  on: boolean;
  key: number;
  velocity: number;
}
export interface PumpContext {
  route: (track: number) => MidiRoute | null;
  /** 0 silences a track; 1 keeps the written dynamics. */
  level: (track: number) => number;
  /** Seconds until the built-in instruments are heard, so both arrive together. */
  latency: number;
  range: { startTick: number; endTick: number } | null;
  looping: boolean;
}
type Send = (outputId: string, data: number[], atSeconds: number) => void;

const LOOKAHEAD = 0.12;
const DISCONTINUITY = 0.15;
const START_GRACE = 0.25;

/** Every note of a generated MIDI file as the player will sound it. */
export function fileEvents(file: midi.MidiFile): OutEvent[] {
  const events: OutEvent[] = [];
  for (const event of file.events) {
    if (event.type !== midi.MidiEventType.NoteOn && event.type !== midi.MidiEventType.NoteOff)
      continue;
    const note = event as midi.NoteEvent;
    const on = event.type === midi.MidiEventType.NoteOn && note.noteVelocity > 0;
    events.push({
      tick: note.tick,
      track: note.track,
      on,
      key: note.noteKey,
      velocity: note.noteVelocity,
    });
  }
  // Release before striking when both fall on the same tick.
  return events.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));
}

/**
 * Sends a score's notes to MIDI outputs slightly ahead of time, with timestamps, so an
 * instrument plugin in another program plays in step with the built-in band. Playback
 * position reports arrive late and unevenly, so timing follows the earliest clock seen.
 */
export class MidiOutScheduler {
  private events: OutEvent[] = [];
  private anchor: { tick: number; time: number } | null = null;
  private cursor = 0;
  private lastTick = -1;
  private awaitingLoop = false;
  private latency = 0;
  private readonly sounding = new Map<string, Set<number>>();

  constructor(
    private readonly send: Send,
    /** Real seconds between two playback ticks at the current tempo. */
    private readonly seconds: (from: number, to: number) => number,
  ) {}

  load(events: OutEvent[], now: number) {
    this.stop(now);
    this.events = events;
  }

  /** A playback position reported by the player during the music. */
  position(tick: number, now: number) {
    if (this.awaitingLoop) {
      const looped = tick < this.lastTick;
      this.lastTick = tick;
      if (!looped) return;
      this.awaitingLoop = false;
    }
    this.lastTick = tick;
    if (this.anchor) {
      const time = now - this.seconds(this.anchor.tick, tick);
      if (Math.abs(time - this.anchor.time) <= DISCONTINUITY) {
        if (time < this.anchor.time) this.anchor.time = time;
        return;
      }
      // A seek, an unexpected loop or a stall: start again from here.
      this.silence(now);
      this.anchor = { tick, time: now };
      this.cursor = this.indexAt(tick);
      return;
    }
    this.anchor = { tick, time: now };
    this.cursor = this.indexAt(tick);
    // The first report arrives a moment after the music starts. Still play the notes
    // it has just passed, or the opening downbeat would be dropped.
    while (this.cursor > 0 && this.seconds(this.events[this.cursor - 1].tick, tick) <= START_GRACE)
      this.cursor--;
  }

  /** Sends everything due in the next moment. Call a few dozen times a second. */
  pump(now: number, context: PumpContext) {
    this.latency = context.latency;
    const horizon = now + LOOKAHEAD;
    const end = context.range?.endTick ?? Infinity;
    for (let guard = 0; this.anchor && guard < 5000; guard++) {
      const event = this.events[this.cursor];
      if (!event || event.tick >= end) {
        if (!context.looping || !context.range) return;
        const loopTime = this.anchor.time + this.seconds(this.anchor.tick, end);
        if (loopTime > horizon) return;
        // The player loops without a gap; follow it before its next report arrives.
        this.allNotesOff(loopTime + context.latency);
        this.anchor = { tick: context.range.startTick, time: loopTime };
        this.cursor = this.indexAt(context.range.startTick);
        this.awaitingLoop = true;
        continue;
      }
      const at = this.anchor.time + this.seconds(this.anchor.tick, event.tick);
      if (at > horizon) return;
      this.cursor++;
      const route = context.route(event.track);
      if (!route) continue;
      const channel = (route.channel - 1) & 0x0f;
      // Aim for the moment the built-in band is heard; anything already due goes out now.
      const when = Math.max(now, at + context.latency);
      if (!event.on) this.send(route.outputId, [0x80 | channel, event.key, 0], when);
      else {
        const level = context.level(event.track);
        if (level <= 0) continue;
        const velocity = Math.max(1, Math.min(127, Math.round(event.velocity * level)));
        this.send(route.outputId, [0x90 | channel, event.key, velocity], when);
        if (!this.sounding.has(route.outputId)) this.sounding.set(route.outputId, new Set());
        this.sounding.get(route.outputId)!.add(channel);
      }
    }
  }

  stop(now: number) {
    this.anchor = null;
    this.awaitingLoop = false;
    this.lastTick = -1;
    this.silence(now);
  }

  private silence(now: number) {
    this.allNotesOff(now);
    // Notes already handed to the output for the next moment still sound; end those too.
    this.allNotesOff(now + LOOKAHEAD + this.latency + 0.02);
    this.sounding.clear();
  }

  private allNotesOff(at: number) {
    for (const [outputId, channels] of this.sounding)
      for (const channel of channels) this.send(outputId, [0xb0 | channel, 123, 0], at);
  }

  private indexAt(tick: number) {
    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (this.events[middle].tick < tick) low = middle + 1;
      else high = middle;
    }
    return low;
  }
}
