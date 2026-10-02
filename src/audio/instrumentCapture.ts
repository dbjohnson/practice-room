import { requireMediaDevices } from './audioDevices';

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
    const source = context.createMediaStreamSource(stream);
    const splitter = context.createChannelSplitter(channelCount);
    const gain = context.createGain();
    const analyser = context.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    source.connect(splitter);
    splitter.connect(gain, 0);
    gain.connect(analyser);
    // Deliberately no connection to context.destination: live input is never monitored.
    return {
      stream,
      context,
      analyser,
      track,
      channelCount,
      deviceId: settings.deviceId ?? deviceId,
      label: track.label || 'Audio interface',
      selectChannel(channel: number) {
        if (!Number.isInteger(channel) || channel < 0 || channel >= channelCount)
          throw new Error('Choose an available input channel.');
        splitter.disconnect();
        splitter.connect(gain, channel);
      },
      setGain(db: number) {
        gain.gain.setTargetAtTime(10 ** (db / 20), context!.currentTime, 0.015);
      },
      close() {
        source.disconnect();
        splitter.disconnect();
        gain.disconnect();
        analyser.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        if (context!.state !== 'closed') void context!.close();
      },
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') void context.close();
    throw error;
  }
}
