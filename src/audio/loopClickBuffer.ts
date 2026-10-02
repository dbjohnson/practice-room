/** Use the backing loop's exact sample count so the click cannot drift at wraps. */
export function loopClickBuffer(
  context: AudioContext,
  click: AudioBuffer,
  frames: number,
  beats: number,
) {
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const output = buffer.getChannelData(0);
  const sample = click.getChannelData(0);
  for (let beat = 0; beat < beats; beat++) {
    const start = Math.round((beat * frames) / beats);
    for (let i = 0; i < sample.length; i++) output[(start + i) % frames] += sample[i];
  }
  return buffer;
}
