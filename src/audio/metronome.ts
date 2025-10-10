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

const CLICK_ATTACK = 0.004;
const CLICK_DECAY = 0.08;
const CLICK_DURATION = CLICK_ATTACK + CLICK_DECAY;
const ACCENT_FREQUENCY = 1100;
const REGULAR_FREQUENCY = 780;
const ACCENT_GAIN = 0.32;
const REGULAR_GAIN = 0.22;
const START_DELAY = 0.1;

type ScheduledClick = {
  oscillator: OscillatorNode;
  gain: GainNode;
  startTime: number;
  stopTime: number;
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

  oscillator.type = 'triangle';
  oscillator.frequency.value = isAccent ? ACCENT_FREQUENCY : REGULAR_FREQUENCY;

  const gainLevel = isAccent ? ACCENT_GAIN : REGULAR_GAIN;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(gainLevel, when + CLICK_ATTACK);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + CLICK_DURATION);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(when);
  oscillator.stop(when + CLICK_DURATION);

  scheduled.push({
    oscillator,
    gain,
    startTime: when,
    stopTime: when + CLICK_DURATION,
  });
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

  let scheduledClicks: ScheduledClick[] = [];
  let stopped = false;
  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let resolvePlayback: (() => void) | null = null;

  const finalize = async (forceStop: boolean) => {
    if (stopped) {
      return;
    }

    stopped = true;

    if (loopTimer !== null) {
      globalThis.clearTimeout(loopTimer);
      loopTimer = null;
    }

    const now = ctx.currentTime;

    for (const { oscillator, gain, startTime: clickStart, stopTime } of scheduledClicks) {
      try {
        const stopAt = forceStop ? Math.max(now, clickStart) : stopTime;
        oscillator.stop(stopAt);
      } catch {
        // ignore oscillator state errors
      }

      try {
        gain.gain.cancelScheduledValues(0);
        gain.gain.setValueAtTime(0.0001, now);
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

    scheduledClicks = [];
    activeCleanup = null;
    resolvePlayback?.();
  };

  activeCleanup = () => finalize(true);

  const pruneOldClicks = () => {
    const threshold = ctx.currentTime - 1;
    scheduledClicks = scheduledClicks.filter((click) => click.stopTime > threshold);
  };

  const scheduleLoop = (includeCountIn: boolean, loopStartTime: number) => {
    if (stopped) {
      return;
    }

    pruneOldClicks();

    const countIn = includeCountIn ? countInBeats : 0;
    const totalBeatsThisLoop = countIn + playbackBeats;
    const playbackStartTime =
      countIn > 0 ? loopStartTime + countIn * secondsPerBeat : loopStartTime;
    const playbackDuration = playbackBeats * secondsPerBeat;

    onSchedule?.({
      audioContext: ctx,
      startTime: loopStartTime,
      playbackStartTime,
      playbackDuration,
      secondsPerBeat,
      countInBeats: countIn,
      beatsPerBar,
      playbackBeats,
      totalBeats: totalBeatsThisLoop,
    });

    for (let beat = 0; beat < totalBeatsThisLoop; beat += 1) {
      const beatTime = loopStartTime + beat * secondsPerBeat;
      const isAccent = beat % beatsPerBar === 0;
      scheduleClick(ctx, beatTime, isAccent, scheduledClicks);
    }

    const nextLoopStart =
      playbackStartTime + playbackDuration;

    const lookAhead = 0.1;
    const delayMs = Math.max(
      0,
      (nextLoopStart - ctx.currentTime - lookAhead) * 1000,
    );

    loopTimer = globalThis.setTimeout(() => {
      loopTimer = null;
      scheduleLoop(false, nextLoopStart);
    }, delayMs);
  };

  const initialStartTime = ctx.currentTime + START_DELAY;
  scheduleLoop(true, initialStartTime);

  return new Promise<void>((resolve) => {
    resolvePlayback = resolve;
  });
}
