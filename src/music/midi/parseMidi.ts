/** Ticks per quarter note used by alphaTab; every parsed time is normalised to it. */
export const PPQ = 960;

export interface MidiNote {
  start: number;
  end: number;
  midi: number;
}
export interface MidiPart {
  name: string;
  channel: number;
  program: number;
  notes: MidiNote[];
}
export interface MidiSong {
  title: string;
  parts: MidiPart[];
  tempos: { tick: number; bpm: number }[];
  meters: { tick: number; numerator: number; denominator: number }[];
  key: { fifths: number; minor: boolean } | null;
}

const families = [
  'Piano',
  'Chromatic percussion',
  'Organ',
  'Guitar',
  'Bass',
  'Strings',
  'Ensemble',
  'Brass',
  'Reed',
  'Pipe',
  'Synth lead',
  'Synth pad',
  'Synth effects',
  'Ethnic',
  'Percussive',
  'Sound effects',
];
const invalid = () => new Error('This MIDI file could not be read. It may be damaged.');

export const isMidi = (bytes: Uint8Array) =>
  bytes.length > 14 && String.fromCharCode(...bytes.subarray(0, 4)) === 'MThd';

export function parseMidi(bytes: Uint8Array): MidiSong {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!isMidi(bytes) || view.getUint32(4) < 6) throw invalid();
  const division = view.getUint16(12);
  if (division & 0x8000 || !division)
    throw new Error('This MIDI file uses film timecode instead of beats and cannot be notated.');
  const scale = PPQ / division;
  const song: MidiSong = { title: '', parts: [], tempos: [], meters: [], key: null };
  const text = (data: Uint8Array) => new TextDecoder('latin1').decode(data).trim();
  let at = 8 + view.getUint32(4);
  for (let track = 0; at + 8 <= bytes.length; track++) {
    const id = String.fromCharCode(...bytes.subarray(at, at + 4));
    const end = Math.min(bytes.length, at + 8 + view.getUint32(at + 4));
    at += 8;
    if (id !== 'MTrk') {
      at = end;
      track--;
      continue;
    }
    const varint = () => {
      let value = 0;
      for (let count = 0; count < 4; count++) {
        if (at >= end) throw invalid();
        const byte = bytes[at++];
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) break;
      }
      return value;
    };
    const parts = new Map<number, MidiPart>();
    const open = new Map<number, number[]>();
    const programs = new Map<number, number>();
    let tick = 0,
      status = 0,
      name = '';
    while (at < end) {
      tick += varint();
      if (bytes[at] & 0x80) status = bytes[at++];
      const now = Math.round(tick * scale);
      if (status === 0xff) {
        const type = bytes[at++],
          length = varint(),
          data = bytes.subarray(at, at + length);
        at += length;
        if (type === 0x03 && !name) name = text(data);
        else if (type === 0x51 && length === 3)
          song.tempos.push({
            tick: now,
            bpm: 60_000_000 / ((data[0] << 16) | (data[1] << 8) | data[2] || 500_000),
          });
        else if (type === 0x58 && length >= 2 && data[0])
          song.meters.push({ tick: now, numerator: data[0], denominator: 2 ** data[1] });
        else if (type === 0x59 && length >= 2 && !song.key)
          song.key = { fifths: (data[0] << 24) >> 24, minor: data[1] === 1 };
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        at += varint();
        continue;
      }
      if (status < 0x80) throw invalid();
      const kind = status & 0xf0,
        channel = status & 0x0f,
        first = bytes[at++],
        second = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[at++];
      if (kind === 0xc0) programs.set(channel, first);
      if (kind !== 0x90 && kind !== 0x80) continue;
      const key = (channel << 7) | first;
      if (kind === 0x90 && second > 0) {
        open.set(key, [...(open.get(key) ?? []), now]);
        continue;
      }
      const start = open.get(key)?.shift();
      if (start === undefined) continue;
      let part = parts.get(channel);
      if (!part) {
        part = { name: '', channel, program: programs.get(channel) ?? 0, notes: [] };
        parts.set(channel, part);
      }
      part.notes.push({ start, end: Math.max(now, start + 1), midi: first });
    }
    at = end;
    if (track === 0 && name) song.title = name;
    for (const part of parts.values()) {
      part.notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
      part.name =
        (parts.size === 1 && name) ||
        (part.channel === 9 ? 'Drums' : families[part.program >> 3]) ||
        'Part';
      song.parts.push(part);
    }
  }
  if (!song.parts.length) throw new Error('This MIDI file does not contain any notes.');
  song.tempos.sort((a, b) => a.tick - b.tick);
  song.meters.sort((a, b) => a.tick - b.tick);
  return song;
}
