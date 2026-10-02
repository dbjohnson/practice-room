export function amplitudeToDb(amplitude: number): number {
  return amplitude > 0 && Number.isFinite(amplitude)
    ? Math.max(-60, Math.min(0, 20 * Math.log10(amplitude)))
    : -60;
}

/** Sample peaks at or above this are treated as clipping. */
export const CLIP_PEAK = 0.98;

export function levelGuidance(peakDb: number, clipped: boolean) {
  if (clipped)
    return {
      kind: 'clip',
      title: 'Clipping — lower the gain',
      detail: 'Turn down the input gain on your interface. Leave room for your loudest notes.',
    };
  if (peakDb <= -48)
    return {
      kind: 'quiet',
      title: 'Waiting for your instrument',
      detail:
        'Play a note. If the meter stays still, check the cable, input channel and interface gain.',
    };
  if (peakDb < -24)
    return {
      kind: 'low',
      title: 'A little more signal',
      detail: 'Raise your interface gain gradually while playing at your normal volume.',
    };
  if (peakDb > -6)
    return {
      kind: 'hot',
      title: 'Leave a little headroom',
      detail: 'Lower the interface gain a little, especially if your louder notes reach the red.',
    };
  return {
    kind: 'good',
    title: 'A healthy input level',
    detail: 'Aim for peaks around −18 to −6 dBFS while playing your loudest notes.',
  };
}
