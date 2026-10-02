export interface RecordingPosition {
  seconds: number;
  tick: number;
}
export interface RecordingData {
  blob: Blob;
  peaks: number[];
  duration: number;
  timeline: RecordingPosition[];
}
export interface AudioRecordingSession {
  finish(origin: number | null, ended: number): Promise<Omit<RecordingData, 'timeline'> | null>;
  snapshot?(origin: number, ended: number): Promise<Omit<RecordingData, 'timeline'> | null>;
}

/** A compact envelope of the actual recorded samples, including silent sections. */
export function waveformPeaks(samples: Float32Array, sampleRate: number): number[] {
  const size = Math.max(1, Math.round(sampleRate / 50));
  const peaks: number[] = [];
  for (let start = 0; start < samples.length; start += size) {
    let peak = 0;
    for (let i = start; i < Math.min(samples.length, start + size); i++)
      peak = Math.max(peak, Math.abs(samples[i]));
    peaks.push(Math.min(1, peak));
  }
  return peaks;
}

export function wavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) =>
    view.setInt16(
      44 + i * 2,
      Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767),
      true,
    ),
  );
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Interpolate the captured playback clock, retaining tempo changes and swing timing. */
export function recordingCoordinate(
  positions: RecordingPosition[],
  value: number,
  from: 'seconds' | 'tick',
): number {
  const to = from === 'seconds' ? 'tick' : 'seconds';
  if (!positions.length) return 0;
  if (value <= positions[0][from]) return positions[0][to];
  let low = 0;
  let high = positions.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (positions[middle][from] <= value) low = middle;
    else high = middle;
  }
  const start = positions[low];
  const end = positions[high];
  const distance = end[from] - start[from];
  return distance > 0
    ? start[to] + Math.min(1, (value - start[from]) / distance) * (end[to] - start[to])
    : end[to];
}
