import type { Sampler } from './sampler';

export interface MetronomeSchedule {
  audioContext: AudioContext;
  startTime: number;
  playbackStartTime: number;
  playbackDuration: number;
  secondsPerBeat: number;
  countInBeats: number;
  beatsPerBar: number;
  playbackBeats: number;
}

export interface PatternRow {
  subdivision: number;
  notes: boolean[];
  sample: string;
  gain?: number;
}

export interface MetronomeOptions {
  sampler: Sampler;
  tempo: number;
  beatsPerBar: number;
  barCount: number;
  onSchedule?: (schedule: MetronomeSchedule) => void;
  patterns: PatternRow[];
}

const CLICK_ATTACK = 0.004;
const CLICK_DECAY = 0.08;
const CLICK_DURATION = CLICK_ATTACK + CLICK_DECAY;
const ACCENT_FREQUENCY = 1100;
const REGULAR_FREQUENCY = 780;
const ACCENT_GAIN = 1.0;
const REGULAR_GAIN = 0.7;
const START_DELAY = 0.1;

type ScheduledClick = {
  source: AudioNode;
  patternGain: GainNode;
  startTime: number;
  stopTime: number;
};

export function getScheduledClicks(): ScheduledClick[] {
  return scheduledClicks;
}

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

let scheduledClicks: ScheduledClick[] = [];
function scheduleClick(
  ctx: AudioContext,
  sampler: Sampler,
  when: number,
  isAccent: boolean,
  patternRow: PatternRow,
  noteIndex: number,
  scheduled: ScheduledClick[],
): void {
  const patternGain = ctx.createGain();
  const noteGain = isAccent ? ACCENT_GAIN : REGULAR_GAIN;
  const sampleNode = sampler.play(patternRow.sample, when, noteGain * (patternRow.gain ?? 1.0));
  if (!sampleNode) return;

  // Set initial gain based on the pattern.
  // It's 1 if the beat is active, and 0 if it's muted.
  patternGain.gain.value = patternRow.notes[noteIndex] ? 1.0 : 0.0;

  sampleNode.connect(patternGain);
  patternGain.connect(ctx.destination);

  // The source node will stop automatically when the buffer is finished.
  const stopTime = when + (CLICK_DURATION);

  scheduled.push({
    source: sampleNode,
    patternGain, // Store the controllable gain node
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
  sampler,
  tempo,
  beatsPerBar,
  barCount,
  onSchedule,
  patterns,
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

    for (const { source, patternGain, startTime: clickStart, stopTime } of scheduledClicks) {
      try {
        const stopAt = forceStop ? Math.max(now, clickStart) : stopTime;
        source.stop(stopAt);
      } catch {
        // ignore oscillator state errors
      }

      try {
        patternGain.gain.cancelScheduledValues(0);
        patternGain.gain.setValueAtTime(0.0001, now);
      } catch {
        // ignore gain scheduling errors
      }

      try {
        source.disconnect();
      } catch {
        // ignore disconnect errors
      }

      try {
        patternGain.disconnect();
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
    });

    // Schedule count-in beats
    for (let beat = 0; beat < countIn; beat++) {
      const beatTime = loopStartTime + beat * secondsPerBeat;
      const isAccent = beat % beatsPerBar === 0; // Count-in is always accented on the downbeat
      const countInPattern: PatternRow = {
        subdivision: 1, notes: [true], sample: 'hihat'
      };
      scheduleClick(ctx, sampler, beatTime, isAccent, countInPattern, 0, scheduledClicks);
    }

    // Schedule playback beats based on the pattern
    for (const patternRow of patterns) {
      const secondsPerNote = secondsPerBeat / patternRow.subdivision;
      for (let i = 0; i < playbackBeats * patternRow.subdivision; i++) {
        const beatTime = playbackStartTime + i * secondsPerNote;
        const isDownbeat = i % patternRow.subdivision === 0;
        const beatInBar = (i / patternRow.subdivision) % beatsPerBar;
        const isAccent = isDownbeat && beatInBar === 0;
        scheduleClick(ctx, sampler, beatTime, isAccent, patternRow, i, scheduledClicks);
      }
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
