import { midi } from '@coderline/alphatab';

const copyAt = (event: midi.MidiEvent, tick: number): midi.MidiEvent =>
  Object.assign(Object.create(Object.getPrototypeOf(event)), event, { tick });
const key = (event: midi.NoteEvent) => `${event.track}:${event.channel}:${event.noteKey}`;

/** Cut a passage, chasing held notes and channel state; release notes at its boundary. */
export function repeatMidiRange(
  original: midi.MidiFile,
  start: number,
  end: number,
  speed: number,
) {
  const cycle: midi.MidiEvent[] = [];
  const held = new Map<string, midi.NoteOnEvent>();
  const events = [...original.events].sort((a, b) => a.tick - b.tick);
  for (const event of events) {
    if (event.tick >= start) break;
    if (event instanceof midi.NoteOnEvent) held.set(key(event), event);
    else if (event instanceof midi.NoteOffEvent) held.delete(key(event));
    else if (
      !(event instanceof midi.EndOfTrackEvent) &&
      !(event instanceof midi.AlphaTabMetronomeEvent)
    )
      cycle.push(copyAt(event, 0));
  }
  for (const event of held.values()) cycle.push(copyAt(event, 0));
  for (const event of events) {
    if (event.tick < start || event.tick > end || event instanceof midi.EndOfTrackEvent) continue;
    if (event.tick === end && !(event instanceof midi.NoteOffEvent)) continue;
    cycle.push(copyAt(event, event.tick - start));
    if (event instanceof midi.NoteOnEvent) held.set(key(event), event);
    else if (event instanceof midi.NoteOffEvent) held.delete(key(event));
  }
  const length = end - start;
  for (const event of held.values())
    cycle.push(new midi.NoteOffEvent(event.track, length, event.channel, event.noteKey, 0));
  const file = new midi.MidiFile();
  file.division = original.division;
  for (let pass = 0; pass < 2; pass++)
    for (const event of cycle) {
      const copy = copyAt(event, event.tick + pass * length);
      if (copy instanceof midi.TempoChangeEvent) copy.beatsPerMinute *= speed;
      file.addEvent(copy);
    }
  for (let track = 0; track < original.tracks.length; track++)
    file.addEvent(new midi.EndOfTrackEvent(track, length * 2));
  return file;
}

export interface LoopTiming {
  startTick: number;
  duration: number;
  beatTimes: number[];
  countInBeats: number;
  countInBeatDuration: number;
  tickAt: (seconds: number) => number;
  secondsAt?: (tick: number) => number;
}

/** Integrate actual MIDI tempo changes, including the tempo in force at the range start. */
export function midiLoopTiming(
  original: midi.MidiFile,
  start: number,
  end: number,
  speed: number,
  initialTempo: number,
  numerator = 4,
  denominator = 4,
): LoopTiming {
  let tempo = initialTempo;
  for (const event of original.events)
    if (event instanceof midi.TempoChangeEvent && event.tick <= start) tempo = event.beatsPerMinute;
  const initialBeatDuration = 60 / (tempo * speed);
  const segments = [{ tick: start, seconds: 0, tempo: tempo * speed }];
  for (const event of original.events) {
    if (!(event instanceof midi.TempoChangeEvent) || event.tick <= start || event.tick >= end)
      continue;
    const previous = segments.at(-1)!;
    segments.push({
      tick: event.tick,
      seconds:
        previous.seconds +
        (((event.tick - previous.tick) / original.division) * 60) / previous.tempo,
      tempo: event.beatsPerMinute * speed,
    });
  }
  const secondsAt = (tick: number) => {
    const segment = [...segments].reverse().find((s) => s.tick <= tick)!;
    return segment.seconds + (((tick - segment.tick) / original.division) * 60) / segment.tempo;
  };
  const beatTicks = [
    ...new Set(
      original.events
        .filter((e) => e instanceof midi.AlphaTabMetronomeEvent && e.tick >= start && e.tick < end)
        .map((e) => e.tick),
    ),
  ];
  return {
    startTick: start,
    secondsAt,
    duration: secondsAt(end),
    beatTimes: beatTicks.length
      ? beatTicks.map(secondsAt)
      : Array.from({ length: Math.ceil((end - start) / original.division) }, (_, i) =>
          secondsAt(start + i * original.division),
        ),
    countInBeats: numerator,
    countInBeatDuration: (initialBeatDuration * 4) / denominator,
    tickAt: (seconds) => {
      const segment = [...segments].reverse().find((s) => s.seconds <= seconds) ?? segments[0];
      return Math.min(
        end - 1,
        Math.floor(
          segment.tick + (((seconds - segment.seconds) * segment.tempo) / 60) * original.division,
        ),
      );
    },
  };
}
