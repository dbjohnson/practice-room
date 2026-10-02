import { requireMediaDevices } from './audioDevices';
import type { InputMessage } from './inputWorklet';
import workletUrl from './inputWorklet.ts?worker&url';

export async function openInstrumentCapture(
  deviceId: string,
  isCurrent: () => boolean = () => true,
) {
  if (!deviceId) throw new Error('Choose your audio interface before connecting.');
  const stream = await requireMediaDevices().getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
  });
  let context: AudioContext | undefined;
  try {
    if (!isCurrent()) throw new DOMException('Connection cancelled.', 'AbortError');
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState === 'ended')
      throw new Error('The input disconnected. Reconnect your interface and try again.');
    context = new AudioContext();
    await context.resume();
    if (!isCurrent()) throw new DOMException('Connection cancelled.', 'AbortError');
    if (track.readyState !== 'live')
      throw new Error('The input disconnected. Reconnect your interface and try again.');
    const settings = track.getSettings();
    const channelCount = Math.max(1, Math.min(32, settings.channelCount ?? 1));
    await context.audioWorklet.addModule(workletUrl);
    if (!isCurrent()) throw new DOMException('Connection cancelled.', 'AbortError');
    const audio = context;
    const source = audio.createMediaStreamSource(stream);
    const splitter = audio.createChannelSplitter(channelCount);
    const gain = audio.createGain();
    // The analyser is the tap for recording and calibration; notes are detected in a worklet.
    const analyser = audio.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    const detector = new AudioWorkletNode(audio, 'practice-room-input', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    source.connect(splitter);
    splitter.connect(gain, 0);
    gain.connect(analyser);
    gain.connect(detector);
    // The detector writes no audio. A muted path to the output only keeps the browser
    // processing it; live input is never monitored.
    const sink = audio.createGain();
    sink.gain.value = 0;
    detector.connect(sink);
    sink.connect(audio.destination);
    // Detector times are on the audio clock; the take clock is performance.now().
    // This gives the moment each sample was processed, before any output delay.
    const toPerformanceSeconds = (time: number) =>
      performance.now() / 1000 - (audio.currentTime - time);
    const inputLatency = (settings as { latency?: number }).latency;
    return {
      stream,
      context,
      analyser,
      track,
      channelCount,
      /** Seconds from the converter to the detector, as the browser reports it. */
      inputLatency: Number.isFinite(inputLatency) && inputLatency! > 0 ? inputLatency! : 0,
      deviceId: settings.deviceId ?? deviceId,
      label: track.label || 'Audio interface',
      selectChannel(channel: number) {
        if (!Number.isInteger(channel) || channel < 0 || channel >= channelCount)
          throw new Error('Choose an available input channel.');
        splitter.disconnect();
        splitter.connect(gain, channel);
        detector.port.postMessage('reset');
      },
      listen(handler: (message: InputMessage) => void) {
        detector.port.onmessage = (event: MessageEvent<InputMessage>) => {
          const message = event.data;
          if (message.type === 'frame')
            handler({
              type: 'frame',
              frame: { ...message.frame, time: toPerformanceSeconds(message.frame.time) },
            });
          else
            handler({
              type: 'observation',
              observation: {
                ...message.observation,
                time: toPerformanceSeconds(message.observation.time),
              },
            });
        };
      },
      setGain(db: number) {
        gain.gain.setTargetAtTime(10 ** (db / 20), audio.currentTime, 0.015);
      },
      close() {
        source.disconnect();
        splitter.disconnect();
        gain.disconnect();
        analyser.disconnect();
        detector.port.onmessage = null;
        detector.disconnect();
        sink.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        if (audio.state !== 'closed') void audio.close();
      },
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') void context.close();
    throw error;
  }
}
