import { midi, synth } from '@coderline/alphatab';

interface TestNote {
  key: number;
  channel: number;
  program: number;
  tick?: number;
  duration?: number;
  velocity?: number;
}

// Reuse decoded samples as the real player does; repeated Vorbis decoding dominates test time.
const players = new WeakMap<Uint8Array, synth.AlphaSynth>();

// Real alphaTab synthesis with a silent output device; no browser or speakers needed.
export function renderAudio(
  soundFont: Uint8Array,
  { bpm = 120, click = 0, notes = [] as TestNote[] } = {},
) {
  const file = new midi.MidiFile();
  const handler = new midi.AlphaSynthMidiFileHandler(file);
  handler.addTimeSignature(0, 4, 4);
  handler.addTempo(0, bpm);
  for (const note of notes) {
    handler.addProgramChange(0, 0, note.channel, note.program);
    handler.addNote(
      0,
      note.tick ?? 0,
      note.duration ?? 960,
      note.key,
      note.velocity ?? 95,
      note.channel,
    );
  }
  handler.finishTrack(0, 3840);
  return renderMidi(soundFont, file, { click });
}

export function renderMidi(
  soundFont: Uint8Array,
  file: midi.MidiFile,
  { click = 0, endTick, volume = 1 }: { click?: number; endTick?: number; volume?: number } = {},
) {
  let player = players.get(soundFont);
  if (!player) {
    player = silentPlayer();
    player.loadSoundFont(soundFont, false);
    players.set(soundFont, player);
  }
  player.loadMidiFile(file);
  const options = new synth.AudioExportOptions();
  options.sampleRate = 48000;
  options.metronomeVolume = click;
  if (endTick) options.playbackRange = { startTick: 0, endTick };
  for (const channel of [0, 2, 4, 9]) options.trackVolume.set(channel, volume);
  const exporter = player.exportAudio(options, file, [], new Map());
  const chunks: Float32Array[] = [];
  for (let chunk = exporter.render(1000); chunk; chunk = exporter.render(1000))
    chunks.push(chunk.samples);
  const result = new Float32Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function silentPlayer() {
  const noop = () => undefined;
  const event = () => ({ on: () => noop, off: noop, trigger: noop });
  return new synth.AlphaSynth(
    {
      sampleRate: 48000,
      open: noop,
      play: noop,
      pause: noop,
      destroy: noop,
      addSamples: noop,
      resetSamples: noop,
      activate: noop,
      ready: {
        ...event(),
        on: (callback: () => void) => {
          callback();
          return noop;
        },
      },
      samplesPlayed: event(),
      sampleRequest: event(),
      enumerateOutputDevices: async () => [],
      setOutputDevice: async () => undefined,
      getOutputDevice: async () => null,
    },
    100,
  );
}
