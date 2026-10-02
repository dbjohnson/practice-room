import clickUrl from './assets/woody-block.wav?url';
import { recordInstrument } from './recordInstrument';
import {
  CALIBRATION_LEAD,
  CALIBRATION_NOTES,
  EIGHTH_SECONDS,
  estimateLatency,
  detectTransients,
} from './latencyCalibration';

/** Measure uncorrected recording transients, using the same detector as final take grading. */
export async function runLatencyCalibration(
  context: AudioContext,
  analyser: AnalyserNode,
  signal: AbortSignal,
  progress: (note: number) => void,
) {
  signal.throwIfAborted();
  await context.resume();
  const response = await fetch(clickUrl, { signal });
  if (!response.ok) throw new Error('The calibration click could not load. Try again.');
  const click = await context.decodeAudioData(await response.arrayBuffer());
  signal.throwIfAborted();
  const recording = recordInstrument(context, analyser, () => {});
  const nodes: AudioBufferSourceNode[] = [];
  const output = context.createGain();
  output.gain.value = 0.65;
  output.connect(context.destination);
  const countIn = context.currentTime + 0.2;
  const start = countIn + 8 * EIGHTH_SECONDS;
  const origin = performance.now() / 1000 + start - context.currentTime - CALIBRATION_LEAD;
  const end = start + CALIBRATION_NOTES * EIGHTH_SECONDS + 0.6;
  let timer = 0;
  let ending = 0;
  let last = -99;
  try {
    const schedule = (at: number, accent: boolean) => {
      const node = context.createBufferSource();
      node.buffer = click;
      node.playbackRate.value = accent ? 1.15 : 1;
      node.connect(output);
      node.start(at);
      nodes.push(node);
    };
    for (let i = 0; i < 4; i++) schedule(countIn + i * 2 * EIGHTH_SECONDS, true);
    for (let i = 0; i < CALIBRATION_NOTES; i++) schedule(start + i * EIGHTH_SECONDS, i % 8 === 0);
    const update = () => {
      const elapsed = context.currentTime - start;
      const note =
        elapsed < 0
          ? Math.max(-4, Math.floor(elapsed / (2 * EIGHTH_SECONDS)))
          : Math.min(32, Math.floor(elapsed / EIGHTH_SECONDS));
      if (note !== last) {
        last = note;
        progress(note);
      }
    };
    update();
    timer = window.setInterval(update, 40);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        window.clearTimeout(ending);
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      ending = window.setTimeout(
        () => {
          signal.removeEventListener('abort', abort);
          resolve();
        },
        Math.max(0, (end - context.currentTime) * 1000),
      );
    });
    signal.throwIfAborted();
    const audio = await recording.finish(origin, performance.now() / 1000);
    signal.throwIfAborted();
    if (!audio) throw new Error('No input was recorded. Check your interface and try again.');
    const decoder = new OfflineAudioContext(1, 1, context.sampleRate);
    const decoded = await decoder.decodeAudioData(await audio.blob.arrayBuffer());
    signal.throwIfAborted();
    const samples = decoded.getChannelData(0);
    return estimateLatency(
      detectTransients(samples, decoded.sampleRate),
      samples.some((sample) => Math.abs(sample) >= 0.98),
    );
  } finally {
    window.clearInterval(timer);
    window.clearTimeout(ending);
    nodes.forEach((node) => {
      node.stop();
      node.disconnect();
    });
    output.disconnect();
    void recording.finish(null, performance.now() / 1000).catch(() => {});
  }
}
