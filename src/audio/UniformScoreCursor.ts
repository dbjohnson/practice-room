import type { AlphaTabApi } from '@coderline/alphatab';

export interface CursorSpan {
  start: number;
  end: number;
  left: number;
  right: number;
  top: number;
  height: number;
}

/** Uniform progress through a measure, independent of swung note attacks and spacing. */
export function uniformCursorPosition(spans: CursorSpan[], tick: number) {
  let low = 0,
    high = spans.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (spans[middle].start <= tick) low = middle + 1;
    else high = middle;
  }
  const span = spans[low - 1];
  if (!span || tick > span.end || span.end <= span.start) return null;
  const progress = Math.max(0, Math.min(1, (tick - span.start) / (span.end - span.start)));
  return { x: span.left + progress * (span.right - span.left), y: span.top, height: span.height };
}

export class UniformScoreCursor {
  private element = document.createElement('div');
  private spans: CursorSpan[] = [];
  private bounds: AlphaTabApi['boundsLookup'] | undefined;
  private cache: AlphaTabApi['tickCache'] | undefined;
  private tick = 0;
  private bpm = 120;
  private at = 0;
  private moving = false;
  private frame = 0;

  constructor(
    private api: AlphaTabApi,
    private host: HTMLElement,
  ) {
    this.element.className = 'uniform-score-cursor';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.hidden = true;
    host.classList.add('uniform-cursor-enabled');
  }

  position(tick: number, bpm: number, moving: boolean) {
    this.tick = tick;
    this.bpm = bpm;
    this.at = performance.now();
    this.moving = moving;
    cancelAnimationFrame(this.frame);
    this.paint();
  }

  pause() {
    this.position(this.api.tickPosition, this.bpm, false);
  }

  redraw = () => {
    this.paint(false);
  };

  private paint(schedule = true) {
    const bounds = this.api.boundsLookup,
      cache = this.api.tickCache;
    if (bounds !== this.bounds || cache !== this.cache) {
      this.bounds = bounds;
      this.cache = cache;
      const bars = new Map(
        bounds?.staffSystems.flatMap((system) =>
          system.bars.map((bar) => [bar.index, bar] as const),
        ),
      );
      this.spans = (cache?.masterBars ?? []).flatMap((time) => {
        const bar = bars.get(time.masterBar.index);
        if (!bar) return [];
        const beats = bar.bars.flatMap((staff) => staff.beats);
        return [
          {
            start: time.start,
            end: time.end,
            left: beats.length ? Math.min(...beats.map((beat) => beat.onNotesX)) : bar.realBounds.x,
            right: bar.realBounds.x + bar.realBounds.w,
            top: bar.visualBounds.y,
            height: bar.visualBounds.h,
          },
        ];
      });
    }
    const tick =
      this.tick + (this.moving ? ((performance.now() - this.at) * this.bpm * 960) / 60000 : 0);
    const point = uniformCursorPosition(this.spans, tick);
    this.element.hidden = !point;
    if (point) {
      if (this.element.parentElement !== this.host) this.host.append(this.element);
      this.element.style.transform = `translate(${point.x}px, ${point.y}px)`;
      this.element.style.height = `${point.height}px`;
    }
    if (schedule && this.moving) this.frame = requestAnimationFrame(() => this.paint());
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.element.remove();
    this.host.classList.remove('uniform-cursor-enabled');
  }
}
