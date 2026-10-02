import { waveformPeaks, wavBlob, type AudioRecordingSession } from './recording';

/** Record only the selected analyser channel; its destination never reaches the speakers. */
export function recordInstrument(
  context: AudioContext,
  analyser: AnalyserNode,
  onPeak: (peak: number) => void,
): AudioRecordingSession {
  if (typeof MediaRecorder === 'undefined')
    throw new Error('Audio recording is unavailable in this browser. Try a current browser.');
  const destination = context.createMediaStreamDestination();
  destination.channelCount = 1;
  destination.channelCountMode = 'explicit';
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  let timer = 0;
  const release = () => {
    window.clearInterval(timer);
    try {
      analyser.disconnect(destination);
    } catch {
      /* Already disconnected. */
    }
    destination.stream.getTracks().forEach((track) => track.stop());
  };
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType } : undefined);
  } catch (error) {
    release();
    throw error;
  }
  const chunks: Blob[] = [];
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      release();
      reject(new Error('The audio recording was interrupted.'));
    };
    recorder.onstop = () => {
      release();
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });
  // An input can disappear before finish handles its error.
  void stopped.catch(() => {});
  const started = performance.now() / 1000;
  try {
    analyser.connect(destination);
    recorder.start(200);
  } catch (error) {
    release();
    throw error;
  }
  const samples = new Float32Array(analyser.fftSize);
  timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let peak = 0;
    for (const value of samples) peak = Math.max(peak, Math.abs(value));
    onPeak(Math.min(1, peak));
  }, 80);
  const waitForEnd = async (ended: number) => {
    const remaining = ended - performance.now() / 1000;
    if (remaining > 0)
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(500, remaining * 1000)));
  };
  const decode = async (blob: Blob, origin: number | null, ended: number) => {
    if (origin === null || ended <= origin || !blob.size) return null;
    const decoder = new OfflineAudioContext(1, 1, context.sampleRate);
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    const start = Math.max(0, Math.round((origin - started) * decoded.sampleRate));
    const end = Math.min(decoded.length, start + Math.round((ended - origin) * decoded.sampleRate));
    if (end <= start) return null;
    const mono = decoded.getChannelData(0).slice(start, end);
    return {
      blob: wavBlob(mono, decoded.sampleRate),
      peaks: waveformPeaks(mono, decoded.sampleRate),
      duration: mono.length / decoded.sampleRate,
    };
  };
  return {
    async snapshot(origin, ended) {
      await waitForEnd(ended);
      if (recorder.state === 'inactive') return decode(await stopped, origin, ended);
      let received: (() => void) | undefined;
      const flushed = new Promise<Blob>((resolve) => {
        received = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType }));
        };
        recorder.addEventListener('dataavailable', received);
        recorder.requestData();
      });
      const blob = await Promise.race([flushed, stopped]).finally(() => {
        if (received) recorder.removeEventListener('dataavailable', received);
      });
      try {
        const result = await decode(blob, origin, ended);
        if (result && result.duration >= ended - origin - 0.03) return result;
      } catch {
        // Some containers require their final trailer. Keep capturing without
        // restarting; their pass clips are finalized when the user stops.
      }
      return decode(await stopped, origin, ended);
    },
    async finish(origin, ended) {
      window.clearInterval(timer);
      if (origin !== null) await waitForEnd(ended);
      if (recorder.state !== 'inactive') recorder.stop();
      return decode(await stopped, origin, ended);
    },
  };
}
