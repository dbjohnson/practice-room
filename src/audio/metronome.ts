export interface MetronomeSchedule {
  audioContext: AudioContext;
  startTime: number;
  playbackStartTime: number;
  playbackDuration: number;
  secondsPerBeat: number;
  countInBeats: number;
  beatsPerBar: number;
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

type ScheduledClick = {
  oscillator: OscillatorNode;
  gain: GainNode;
  startTime: number;
};

let audioContext: AudioContext | null = null;
let activeCleanup: (() => Promise<void>) | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
}

export function getMetronomeContext(): AudioContext {
  return getAudioContext();
}

function scheduleClick(
  ctx: AudioContext,
  when: number,
  isAccent: boolean,
  scheduled: ScheduledClick[],
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

  scheduled.push({ oscillator, gain, startTime: when });
}

export async function stopMetronome(): Promise<void> {
  if (activeCleanup) {
    await activeCleanup();
  }
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

  await stopMetronome();

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
    beatsPerBar,
    playbackBeats,
    totalBeats,
  });

  const scheduledClicks: ScheduledClick[] = [];

  for (let beat = 0; beat < totalBeats; beat += 1) {
    const beatTime = startTime + beat * secondsPerBeat;
    const isAccent = beat % beatsPerBar === 0;
    scheduleClick(ctx, beatTime, isAccent, scheduledClicks);
  }

  const totalDuration =
    totalBeats * secondsPerBeat + CLICK_DURATION + START_DELAY;

  return new Promise<void>((resolve) => {
    let completionTimer: number | null = null;
    let finished = false;
    let cleanupPromise: Promise<void> | null = null;

    const finalize = (forceStop: boolean): Promise<void> => {
      if (finished) {
        return cleanupPromise ?? Promise.resolve();
      }
      finished = true;

      if (completionTimer !== null) {
        globalThis.clearTimeout(completionTimer);
        completionTimer = null;
      }

      const work = (async () => {
        for (const { oscillator, gain, startTime: clickStart } of scheduledClicks) {
          try {
            const stopAt = forceStop
              ? Math.max(ctx.currentTime, clickStart)
              : clickStart + CLICK_DURATION;
            oscillator.stop(stopAt);
          } catch {
            // ignore oscillator state errors
          }

          try {
            gain.gain.cancelScheduledValues(0);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          } catch {
            // ignore gain scheduling errors
          }

          try {
            oscillator.disconnect();
          } catch {
            // ignore disconnect errors
          }

          try {
            gain.disconnect();
          } catch {
            // ignore disconnect errors
          }
        }

        scheduledClicks.length = 0;
      })().finally(() => {
        activeCleanup = null;
        resolve();
      });

      cleanupPromise = work;
      return work;
    };

    activeCleanup = () => finalize(true);

    const timeout = (totalDuration - (ctx.baseLatency ?? 0)) * 1000;
    completionTimer = globalThis.setTimeout(() => {
      void finalize(false);
    }, Math.max(0, timeout));
  });
}
