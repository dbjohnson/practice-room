export interface MetronomeSchedule {
  audioContext: AudioContext;
  startTime: number;
  playbackStartTime: number;
  playbackDuration: number;
  secondsPerBeat: number;
  countInBeats: number;
  playbackBeats: number;
  totalBeats: number;
}

export interface MetronomeOptions {
  tempo: number;
  beatsPerBar: number;
  barCount: number;
  onSchedule?: (schedule: MetronomeSchedule) => void;
}

const CLICK_DURATION = 0.08;
const ACCENT_FREQUENCY = 1200;
const REGULAR_FREQUENCY = 900;
const ACCENT_GAIN = 0.5;
const REGULAR_GAIN = 0.35;
const START_DELAY = 0.1;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
}

function scheduleClick(
  ctx: AudioContext,
  when: number,
  isAccent: boolean,
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'square';
  oscillator.frequency.value = isAccent ? ACCENT_FREQUENCY : REGULAR_FREQUENCY;

  const gainLevel = isAccent ? ACCENT_GAIN : REGULAR_GAIN;
  gain.gain.setValueAtTime(gainLevel, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + CLICK_DURATION);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(when);
  oscillator.stop(when + CLICK_DURATION);
}

export async function startMetronome({
  tempo,
  beatsPerBar,
  barCount,
  onSchedule,
}: MetronomeOptions): Promise<void> {
  if (tempo <= 0) {
    throw new Error('Tempo must be positive');
  }
  if (beatsPerBar <= 0) {
    throw new Error('Beats per bar must be positive');
  }
  if (barCount <= 0) {
    throw new Error('Bar count must be positive');
  }

  const ctx = getAudioContext();
  await ctx.resume();

  const secondsPerBeat = 60 / tempo;
  const countInBeats = beatsPerBar;
  const playbackBeats = beatsPerBar * barCount;
  const totalBeats = countInBeats + playbackBeats;
  const playbackDuration = playbackBeats * secondsPerBeat;

  const startTime = ctx.currentTime + START_DELAY;
  const playbackStartTime = startTime + countInBeats * secondsPerBeat;

  onSchedule?.({
    audioContext: ctx,
    startTime,
    playbackStartTime,
    playbackDuration,
    secondsPerBeat,
    countInBeats,
    playbackBeats,
    totalBeats,
  });

  for (let beat = 0; beat < totalBeats; beat += 1) {
    const beatTime = startTime + beat * secondsPerBeat;
    const isAccent = beat % beatsPerBar === 0;
    scheduleClick(ctx, beatTime, isAccent);
  }

  const totalDuration =
    totalBeats * secondsPerBeat + CLICK_DURATION + START_DELAY;

  await new Promise<void>((resolve) => {
    const timeout = (totalDuration - (ctx.baseLatency ?? 0)) * 1000;
    setTimeout(resolve, Math.max(0, timeout));
  });
}
