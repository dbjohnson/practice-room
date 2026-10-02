import type { AlphaTabApi } from '@coderline/alphatab';

/** Map recording ticks through the engraving's beat spacing, not equal-width bars. */
export function waveformLayout(
  api: AlphaTabApi,
  points: { tick: number; peak: number }[],
  track: number,
): string {
  const cache = api.tickCache;
  const bounds = api.boundsLookup;
  if (!cache || !bounds) return '';
  const segments = bounds.staffSystems
    .flatMap((system, row) =>
      system.bars.flatMap((master) => {
        const bar = master.bars.find((candidate) =>
          candidate.beats.some((beat) => beat.beat.voice.bar.staff.track.index === track),
        );
        if (!bar) return [];
        const beats = bar.beats.filter((beat) => beat.beat.voice.index === 0);
        return beats.map((beat, index) => ({
          row,
          start: cache.getBeatStart(beat.beat),
          end: beats[index + 1]
            ? cache.getBeatStart(beats[index + 1].beat)
            : cache.getMasterBar(beat.beat.voice.bar.masterBar).end,
          x: beat.onNotesX,
          right: beats[index + 1]?.onNotesX ?? master.realBounds.x + master.realBounds.w,
          y: master.lineAlignedBounds.y + master.lineAlignedBounds.h / 2,
        }));
      }),
    )
    .sort((a, b) => a.start - b.start);
  const amplitude = 26 * api.settings.display.scale;
  let segment = 0;
  const rows: { x: number; y: number; height: number }[][] = [];
  let currentRow = -1;
  for (const { tick, peak } of points) {
    while (segment + 1 < segments.length && segments[segment + 1].start <= tick) segment++;
    const span = segments[segment];
    if (!span || tick < span.start || tick > span.end || span.end <= span.start) continue;
    const x = span.x + ((tick - span.start) / (span.end - span.start)) * (span.right - span.x);
    const height = Math.max(0.5, Math.sqrt(Math.max(0, Math.min(1, peak))) * amplitude);
    if (span.row !== currentRow) {
      rows.push([]);
      currentRow = span.row;
    }
    const row = rows.at(-1)!;
    const previous = row.at(-1);
    // Keep the strongest peak when multiple samples map onto the same screen pixel.
    if (previous && x - previous.x < 1) previous.height = Math.max(previous.height, height);
    else row.push({ x, y: span.y, height });
  }
  return rows
    .map((row) => {
      if (row.length === 1) row.push({ ...row[0], x: row[0].x + 1 });
      const top = row.map(({ x, y, height }) => `${x.toFixed(1)},${(y - height).toFixed(1)}`);
      const bottom = [...row]
        .reverse()
        .map(({ x, y, height }) => `${x.toFixed(1)},${(y + height).toFixed(1)}`);
      return `M${top.join('L')}L${bottom.join('L')}Z`;
    })
    .join('');
}
