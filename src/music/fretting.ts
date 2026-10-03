export interface Fingering {
  /** alphaTab string number: 1 is the lowest-pitched string. */
  string: number;
  fret: number;
  midi: number;
}

const MAX_FRET = 22;
const MAX_SPAN = 4;

/** Every way to place ascending pitches on strictly ascending strings. */
function* placements(
  pitches: number[],
  open: number[],
  from = 0,
): Generator<Omit<Fingering, 'midi'>[]> {
  if (!pitches.length) {
    yield [];
    return;
  }
  for (let index = from; index <= open.length - pitches.length; index++) {
    const fret = pitches[0] - open[index];
    if (fret < 0 || fret > MAX_FRET) continue;
    for (const rest of placements(pitches.slice(1), open, index + 1))
      yield [{ string: index + 1, fret }, ...rest];
  }
}

function cost(shape: Omit<Fingering, 'midi'>[], position: number) {
  const fretted = shape.map((note) => note.fret).filter((fret) => fret > 0);
  // Open strings are free near the nut but break up a line played higher on the neck.
  if (!fretted.length) return position * 0.5;
  const span = Math.max(...fretted) - Math.min(...fretted);
  if (span > MAX_SPAN) return Infinity;
  // Stay near the hand, prefer compact shapes, and lean slightly toward the nut.
  return (
    fretted.reduce((sum, fret) => sum + Math.abs(fret - position), 0) / fretted.length +
    span * 1.5 +
    Math.min(...fretted) * 0.15
  );
}

/**
 * Places simultaneous pitches on a fretted instrument near the current hand position.
 * `tuning` lists open strings from highest to lowest, as alphaTab stores them. Notes that
 * cannot be reached together are left out, inner voices first.
 */
export function fingerChord(
  pitches: number[],
  tuning: number[],
  position: number,
): { notes: Fingering[]; position: number } {
  const open = [...tuning].reverse();
  let wanted = [...new Set(pitches)].sort((a, b) => a - b).slice(-open.length);
  while (wanted.length) {
    let best: Omit<Fingering, 'midi'>[] | null = null,
      bestCost = Infinity;
    for (const shape of placements(wanted, open)) {
      const value = cost(shape, position);
      if (value < bestCost) [best, bestCost] = [shape, value];
    }
    if (best) {
      const fretted = best.map((note) => note.fret).filter((fret) => fret > 0);
      const centre = fretted.length ? Math.min(...fretted) : position;
      return {
        notes: best.map((note, index) => ({ ...note, midi: wanted[index] })),
        position: Math.abs(centre - position) > 2 ? centre : position,
      };
    }
    // Keep the bass and melody notes; drop from the middle of the chord.
    wanted = wanted.filter((_, index) => index !== Math.floor(wanted.length / 2));
  }
  return { notes: [], position };
}

const guitar = [64, 59, 55, 50, 45, 40];
const bass = [43, 38, 33, 28];
/**
 * Picks the most ordinary tuning that reaches the part's notes, or none for other instruments.
 * The name is checked too: engraved editions often leave every part on the piano program.
 */
export function tuningFor(
  program: number,
  name: string,
  lowest: number,
  highest: number,
): number[] | null {
  const family = program >> 3;
  const options =
    family === 3 || /guitar|gtr/i.test(name)
      ? [guitar, [...guitar.slice(0, 5), 38], [...guitar, 35]]
      : family === 4
        ? [bass, [...bass, 23]]
        : [];
  return (
    options.find((tuning) => lowest >= tuning.at(-1)! && highest <= tuning[0] + MAX_FRET) ?? null
  );
}
