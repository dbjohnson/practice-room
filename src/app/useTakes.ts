import { useCallback, useRef, useState } from 'react';
import type { GymTakeContext } from '../domain/gym';
import type { AlphaTabApi, model } from '@coderline/alphatab';
import type { LoopRange, Observation, Piece, Take } from '../domain/types';
import { assess, exampleNotes, summarize } from '../audio/assessment';
import { analyseRecordedTake } from '../audio/recordedAssessment';
import { expectedNotes, playbackRange, secondsBetween } from '../music/scoreTimeline';
import { loadTakes, writeLocal } from '../storage/library';
import { ticksToSeconds } from '../time/timeline';
import { useTakeAudio, type RecordAudio } from './useTakeAudio';

interface TakeOptions {
  gym?: GymTakeContext;
  onGymTake?: (take: Take) => void;
  piece: Piece;
  score: model.Score;
  track: number;
  tempo: number;
  range: LoopRange;
  api: React.RefObject<AlphaTabApi | null>;
  notify: (s: string) => void;
  recordAudio?: React.RefObject<RecordAudio | null>;
  swing?: number | null;
  transpose?: number;
  /** The player's saved timing calibration for this input, in milliseconds. */
  inputLatency?: React.RefObject<number | null>;
  /** Output plus input delay as the browser reports it, used when nothing is calibrated. */
  reportedLatency?: React.RefObject<number | null>;
  /** Which kind of instrument is connected, read when a take begins. */
  source?: React.RefObject<'microphone' | 'midi'>;
}
// Real seconds between two ticks at the practice tempo. The player scales the whole
// score, so written tempo changes inside the passage are kept.
function elapsed(options: TakeOptions, from: number, to: number, bpm = options.tempo) {
  const cache = options.api.current?.tickCache;
  return cache
    ? secondsBetween(cache, from, to) / (options.tempo / options.score.tempo)
    : ticksToSeconds(to - from, bpm);
}
// Median offset of recorded attacks from the same attacks heard live, or null when too
// few can be paired to trust it.
function recordingSkew(recorded: Observation[], live: Observation[]) {
  const offsets: number[] = [];
  for (const attack of live) {
    let nearest: number | null = null;
    for (const other of recorded) {
      const offset = other.time - attack.time;
      if (Math.abs(offset) <= 0.15 && (nearest === null || Math.abs(offset) < Math.abs(nearest)))
        nearest = offset;
    }
    if (nearest !== null) offsets.push(nearest);
  }
  if (offsets.length < 3) return null;
  offsets.sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}
export function useTakes(options: TakeOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [takes, setTakes] = useState<Take[]>(loadTakes);
  const [review, setReview] = useState<Take | null>(null);
  const [recording, setRecording] = useState(false);
  const [passResult, setPassResult] = useState<Take | null>(null);
  const audio = useTakeAudio(options.notify);
  const latestAudio = useRef(audio);
  latestAudio.current = audio;
  const capture = useRef<{
    observations: Observation[];
    started: number;
    origin: number | null;
    startTick: number;
    endTick: number;
    options: TakeOptions;
    latencyMs: number | null;
    reportedMs: number | null;
    looping: boolean;
    record: boolean;
    pass: number;
    source: 'microphone' | 'midi';
  } | null>(null);
  const lastTick = useRef<number | null>(null);
  const onPosition = useCallback((tick: number, bpm: number, origin?: number) => {
    const take = capture.current;
    if (!take || tick < take.startTick) return;
    lastTick.current = tick;
    if (origin !== undefined) take.origin = origin;
    else {
      // A busy page delivers position events late, never early: keep the earliest clock.
      const heard = performance.now() / 1000 - elapsed(take.options, take.startTick, tick, bpm);
      take.origin = take.origin === null ? heard : Math.min(take.origin, heard);
    }
    latestAudio.current.position(tick, performance.now() / 1000 - take.origin, take.startTick);
  }, []);
  const onObservation = useCallback((observation: Observation) => {
    const take = capture.current;
    // Input can arrive before the first playback position. Keep absolute timestamps
    // until review so delayed pitch detection cannot pull count-in audio into the take.
    if (take && observation.time >= take.started)
      take.observations.push({
        ...observation,
        time: observation.time - (take.latencyMs ?? take.reportedMs ?? 0) / 1000,
      });
  }, []);
  const make = (
    origin: Take['origin'],
    settings: TakeOptions,
    notes: Take['notes'],
    duration: number,
  ): Take => ({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    pieceId: settings.piece.id,
    pieceTitle: settings.piece.title,
    trackName: settings.score.tracks[settings.track]?.name ?? 'Selected part',
    tempo: settings.tempo,
    transpose: settings.gym ? 0 : (settings.transpose ?? 0),
    range: { ...settings.range },
    origin,
    notes,
    ...summarize(notes),
    duration,
    calibrated: false,
    rubric: origin === 'midi' ? 'midi-v1' : 'mono-v3',
    gym: origin !== 'example' ? settings.gym : undefined,
  });
  const finish = useCallback((completed = false, boundary?: number) => {
    const captured = capture.current;
    if (!captured) return;
    if (boundary === undefined) {
      capture.current = null;
      setRecording(false);
    } else {
      capture.current = {
        ...captured,
        observations: captured.observations.filter((o) => o.time >= boundary),
        origin: boundary,
        pass: captured.pass + 1,
      };
      lastTick.current = captured.startTick;
    }
    const opts = captured.options;
    const ended = boundary ?? performance.now() / 1000;
    const origin = captured.origin;
    if (completed && origin !== null)
      latestAudio.current.position(captured.endTick, ended - origin, captured.startTick);
    // Stopping just after a wrap must keep the completed pass visible. Still
    // release the continuous recorder, without retaining an empty extra take.
    if (
      boundary === undefined &&
      captured.looping &&
      captured.pass > 1 &&
      (origin === null || ended - origin < 0.1)
    ) {
      void latestAudio.current.finish(make(captured.source, opts, [], 0), null, ended);
      return;
    }
    const playedUntil =
      origin === null
        ? captured.startTick - 1
        : completed
          ? Infinity
          : (lastTick.current ?? captured.startTick - 1);
    // MIDI reports every key, so chords are graded; audio detection hears one note.
    const midi = captured.source === 'midi';
    const expected = expectedNotes(opts.score, opts.track, opts.range, opts.api.current, midi)
      .filter((note) => note.tick <= playedUntil)
      .map((note) => ({ ...note, time: elapsed(opts, captured.startTick, note.tick) }));
    const observations =
      origin === null
        ? []
        : captured.observations
            .filter((observation) => observation.time >= origin && observation.time <= ended)
            .map((observation) => ({ ...observation, time: observation.time - origin }));
    const notes = assess(expected, observations, opts.tempo, captured.startTick);
    const result = {
      ...make(captured.source, opts, notes, origin === null ? 0 : Math.max(0, ended - origin)),
      interrupted: !completed || origin === null,
      calibrated: !midi && captured.latencyMs !== null,
      latencyMs: captured.latencyMs ?? captured.reportedMs ?? undefined,
      ...(captured.latencyMs !== null
        ? { latencySource: 'calibrated' as const }
        : captured.reportedMs !== null
          ? { latencySource: 'reported' as const }
          : {}),
      ...(captured.looping ? { pass: captured.pass } : {}),
    };
    if (captured.looping) {
      if (completed || captured.pass === 1) setPassResult(result);
    } else if (!captured.record || opts.gym) setPassResult(result);
    else setReview(result);
    if (!captured.record) return;
    const correction = (captured.latencyMs ?? captured.reportedMs ?? 0) / 1000;
    const finalize =
      boundary !== undefined ? latestAudio.current.snapshot : latestAudio.current.finish;
    void finalize(
      result,
      origin === null ? null : origin + correction,
      ended + correction,
      async (blob) => {
        // The WAV was already shifted by the saved offset. Never subtract it a second time.
        let recorded = await analyseRecordedTake(blob);
        // A calibration is measured on the recording itself. Without one, the recording's
        // clock is unknown, so line it up with the attacks heard live on the audio clock.
        if (captured.latencyMs === null) {
          const skew = recordingSkew(recorded, observations);
          if (skew !== null) recorded = recorded.map((o) => ({ ...o, time: o.time - skew }));
        }
        const notes = assess(expected, recorded, opts.tempo, captured.startTick);
        return { ...result, notes, ...summarize(notes) };
      },
    ).then(async (withAudio) => {
      if (withAudio.gym || captured.looping) {
        if (withAudio.audio) {
          try {
            await latestAudio.current.save(withAudio);
          } catch {
            opts.notify(
              'The result is saved without audio because recording storage is unavailable.',
            );
            withAudio = { ...withAudio, audio: undefined };
          }
        }
        setTakes((current) => {
          const next = [withAudio, ...current.filter((t) => t.id !== withAudio.id)].slice(0, 200);
          if (!writeLocal('takes', next))
            opts.notify(
              'Recent take details could not be saved. Gym metrics are stored separately.',
            );
          return next;
        });
        if (withAudio.gym) latest.current.onGymTake?.(withAudio);
      }
      setReview((current) => (current?.id === result.id ? withAudio : current));
      setPassResult((current) => (current?.id === result.id ? withAudio : current));
    });
    // Gym attempts retain every result; record eligibility is handled by the gym ledger.
  }, []);
  const begin = (record = true, looping = false) => {
    if (capture.current || audio.processing) return false;
    const opts = latest.current;
    const api = opts.api.current;
    if (!api?.isReadyForPlayback) return false;
    const range = playbackRange(api, opts.score, opts.range);
    if (!range) return false;
    try {
      if (record)
        audio.begin(
          opts.recordAudio?.current ?? undefined,
          opts.piece.id,
          opts.track,
          opts.swing ?? null,
        );
    } catch (error) {
      opts.notify(error instanceof Error ? error.message : 'Could not start recording.');
      return false;
    }
    api.stop();
    capture.current = {
      observations: [],
      started: performance.now() / 1000,
      origin: null,
      startTick: range.startTick,
      endTick: range.endTick,
      options: { ...opts, range: { ...opts.range } },
      latencyMs: opts.inputLatency?.current ?? null,
      reportedMs: opts.reportedLatency?.current ?? null,
      looping,
      record,
      pass: 1,
      source: opts.source?.current ?? 'microphone',
    };
    lastTick.current = null;
    setPassResult(null);
    setReview(null);
    setRecording(record);
    api.tickPosition = range.startTick;
    return true;
  };
  const showExample = () => {
    const opts = latest.current;
    const notes = exampleNotes(expectedNotes(opts.score, opts.track, opts.range, opts.api.current));
    setReview(
      make('example', opts, notes, ((opts.range.end - opts.range.start + 1) * 4 * 60) / opts.tempo),
    );
  };
  const save = async (take: Take) => {
    if (take.origin === 'example') {
      options.notify('Example takes are for exploring feedback. They do not change your progress.');
      return;
    }
    if (take.audio) {
      try {
        await audio.save(take);
      } catch {
        options.notify(
          'The recording could not be saved. Free some browser storage and try again.',
        );
        return;
      }
    }
    setTakes((current) => {
      const next = [take, ...current.filter((t) => t.id !== take.id)].slice(0, 200);
      if (!writeLocal('takes', next))
        options.notify('Take kept for this session. Your browser could not save it permanently.');
      else options.notify('Take saved to your progress on this device.');
      return next;
    });
  };
  const clear = () => {
    setTakes([]);
    writeLocal('takes', []);
    audio.clear();
    options.notify('Practice history cleared on this device.');
  };
  return {
    takes,
    review,
    setReview,
    recording,
    passResult,
    begin,
    finishPass: (ended?: number) => finish(true, ended ?? performance.now() / 1000),
    finish,
    onPosition,
    onObservation,
    showExample,
    save,
    clear,
    audio,
  };
}
