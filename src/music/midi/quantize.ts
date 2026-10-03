import { PPQ, type MidiNote } from './parseMidi';

export interface BarSpan {
  start: number;
  length: number;
}
/** One notated beat: `ticks` is its written length; tuplet beats are 3-in-the-time-of-2. */
export interface QuantizedBeat {
  ticks: number;
  tuplet: boolean;
  pitches: number[];
  tied: boolean;
}

/**
 * Straight lengths a beat may take, longest first, with the grid each must start on.
 * Dotted values start on twice their base so they never straddle the next strong beat.
 */
const straight: [ticks: number, grid: number][] = [
  [3840, 960],
  [2880, 3840],
  [1920, 960],
  [1440, 1920],
  [960, 960],
  [720, 960],
  [480, 480],
  [360, 480],
  [240, 240],
  [120, 120],
];
const triplet = [640, 320, 160];
/** Notes this close to a grid line (1/32 of a beat) are treated as exactly on it. */
const TOLERANCE = PPQ / 32;

function snap(tick: number, start: number, length: number, division: number) {
  const step = length / division;
  return start + Math.round(Math.round((tick - start) / step) * step);
}

/**
 * Chooses how each quarter-note cell is subdivided. Sixteenths and eighth triplets cover
 * most sequenced music; finer grids are only used when the notes sit exactly on them.
 */
function cellDivisions(onsets: number[], bars: BarSpan[]) {
  const cells: { start: number; length: number; division: number; bar: number }[] = [];
  let next = 0;
  bars.forEach((bar, index) => {
    for (let start = bar.start; start < bar.start + bar.length; start += PPQ) {
      const length = Math.min(PPQ, bar.start + bar.length - start);
      const inside: number[] = [];
      while (next < onsets.length && onsets[next] < start + length - TOLERANCE)
        inside.push(onsets[next++]);
      const options = length === PPQ ? [4, 3, 8, 6] : [Math.max(1, Math.round(length / 240))];
      const errors = options.map((division) => ({
        division,
        each: inside.map((tick) => Math.abs(tick - snap(tick, start, length, division))),
      }));
      const exact = errors.find((e) => e.each.every((error) => error <= TOLERANCE));
      const total = (e: (typeof errors)[number]) => e.each.reduce((sum, error) => sum + error, 0);
      const loose = errors.slice(0, 2).sort((a, b) => total(a) - total(b))[0];
      cells.push({ start, length, division: (exact ?? loose).division, bar: index });
    }
  });
  return cells;
}

/** Turns one part's notes into a single voice of notated beats that exactly fill each bar. */
export function quantize(notes: MidiNote[], bars: BarSpan[]): QuantizedBeat[][] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const cells = cellDivisions(
    sorted.map((note) => note.start),
    bars,
  );
  const total = bars.at(-1)!.start + bars.at(-1)!.length;
  const cellAt = (tick: number) => {
    let low = 0,
      high = cells.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (cells[middle].start <= tick) low = middle;
      else high = middle - 1;
    }
    return cells[low];
  };
  const grid = (tick: number) => {
    const cell = cellAt(Math.min(Math.max(tick, 0), total - 1));
    return Math.min(total, snap(tick, cell.start, cell.length, cell.division));
  };
  const events = new Map<number, { pitches: Set<number>; end: number }>();
  for (const note of sorted) {
    const start = grid(note.start);
    if (start >= total) continue;
    const event = events.get(start) ?? { pitches: new Set<number>(), end: 0 };
    event.pitches.add(note.midi);
    event.end = Math.max(event.end, note.end);
    events.set(start, event);
  }
  const starts = [...events.keys()].sort((a, b) => a - b);
  const spans: { start: number; end: number; pitches: number[] }[] = [];
  let cursor = 0;
  starts.forEach((start, index) => {
    const event = events.get(start)!,
      next = starts[index + 1] ?? total,
      cell = cellAt(start);
    let end = Math.max(grid(event.end), start + cell.length / cell.division);
    // Detached playing is still written as a full-length note unless the gap is a real rest.
    if (end > next || next - end <= 240 || event.end - start >= 0.6 * (next - start)) end = next;
    end = Math.min(end, total);
    if (start > cursor) spans.push({ start: cursor, end: start, pitches: [] });
    spans.push({ start, end, pitches: [...event.pitches].sort((a, b) => a - b) });
    cursor = end;
  });
  if (cursor < total) spans.push({ start: cursor, end: total, pitches: [] });

  const result: QuantizedBeat[][] = bars.map(() => []);
  for (const span of spans) {
    let at = span.start,
      tied = false;
    while (at < span.end) {
      const cell = cellAt(at),
        cellEnd = cell.start + cell.length,
        bar = bars[cell.bar],
        barEnd = bar.start + bar.length,
        tuplet = cell.division % 3 === 0 && !(at === cell.start && span.end >= cellEnd);
      let ticks: number | undefined;
      if (tuplet) {
        const limit = Math.min(span.end, cellEnd);
        ticks = triplet.find((d) => (at - cell.start) % d === 0 && at + d <= limit);
      } else {
        // A straight beat may cover whole triplet cells but must not end inside one.
        const last = cellAt(Math.min(span.end, barEnd) - 1);
        const inside = last.division % 3 === 0 && span.end < last.start + last.length;
        const limit = inside ? last.start : Math.min(span.end, barEnd);
        ticks = straight.find(([d, on]) => (at - bar.start) % on === 0 && at + d <= limit)?.[0];
      }
      // Off-grid remainders are dropped rather than written as unreadable fragments.
      if (!ticks) {
        at = Math.min(span.end, tuplet ? cellEnd : at + 120 - ((at - bar.start) % 120));
        continue;
      }
      result[cell.bar].push({ ticks, tuplet, pitches: span.pitches, tied });
      tied = span.pitches.length > 0;
      at += ticks;
    }
  }
  return result;
}
