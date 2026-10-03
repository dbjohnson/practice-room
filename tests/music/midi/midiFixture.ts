type Event = { tick: number; bytes: number[] };
const varint = (value: number) => {
  const out = [value & 0x7f];
  while ((value >>= 7)) out.unshift((value & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export const note = (start: number, length: number, midi: number, channel = 0): Event[] => [
  { tick: start, bytes: [0x90 | channel, midi, 90] },
  { tick: start + length, bytes: [0x80 | channel, midi, 0] },
];
export const program = (channel: number, value: number): Event => ({
  tick: 0,
  bytes: [0xc0 | channel, value],
});
export const tempo = (bpm: number, tick = 0): Event => {
  const micros = Math.round(60_000_000 / bpm);
  return { tick, bytes: [0xff, 0x51, 3, micros >> 16, (micros >> 8) & 255, micros & 255] };
};
export const meter = (numerator: number, denominator: number, tick = 0): Event => ({
  tick,
  bytes: [0xff, 0x58, 4, numerator, Math.log2(denominator), 24, 8],
});
export const name = (text: string): Event => ({
  tick: 0,
  bytes: [0xff, 0x03, text.length, ...ascii(text)],
});

/** Builds a format-1 MIDI file; `division` is the file's own ticks per quarter note. */
export function midiFile(tracks: Event[][], division = 480): Uint8Array<ArrayBuffer> {
  const chunks = tracks.map((events) => {
    let last = 0;
    const body = [...events]
      .sort((a, b) => a.tick - b.tick)
      .flatMap((event) => {
        const delta = varint(event.tick - last);
        last = event.tick;
        return [...delta, ...event.bytes];
      });
    body.push(0, 0xff, 0x2f, 0);
    return [...ascii('MTrk'), ...u32(body.length), ...body];
  });
  return Uint8Array.from([
    ...ascii('MThd'),
    ...u32(6),
    0,
    1,
    0,
    tracks.length,
    division >> 8,
    division & 255,
    ...chunks.flat(),
  ]);
}
