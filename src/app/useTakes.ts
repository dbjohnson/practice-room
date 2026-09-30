import { useCallback, useRef, useState } from 'react';
import type { AlphaTabApi, model } from '@coderline/alphatab';
import type { LoopRange, Observation, Piece, Take } from '../domain/types';
import { assess, exampleNotes, summarize } from '../audio/assessment';
import { expectedNotes, playbackRange } from '../music/scoreTimeline';
import { loadTakes, writeLocal } from '../storage/library';
import { ticksToSeconds } from '../time/timeline';

interface TakeOptions {
  piece: Piece;
  score: model.Score;
  track: number;
  tempo: number;
  range: LoopRange;
  api: React.RefObject<AlphaTabApi | null>;
  notify: (s: string) => void;
}
export function useTakes(options: TakeOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [takes, setTakes] = useState<Take[]>(loadTakes);
  const [review, setReview] = useState<Take | null>(null);
  const [recording, setRecording] = useState(false);
  const capture = useRef<{
    observations: Observation[];
    started: number;
    origin: number | null;
    startTick: number;
    options: TakeOptions;
  } | null>(null);
  const lastAnchor = useRef<{ tick: number; at: number; bpm: number } | null>(null);
  const onPosition = useCallback((tick: number, bpm: number) => {
    const now = performance.now() / 1000;
    lastAnchor.current = { tick, at: now, bpm };
    const take = capture.current;
    if (take && take.origin === null && tick >= take.startTick)
      take.origin = now - ticksToSeconds(tick - take.startTick, bpm);
  }, []);
  const onObservation = useCallback((observation: Observation) => {
    const take = capture.current;
    if (take?.origin !== null && take?.origin !== undefined)
      take.observations.push({ ...observation, time: observation.time - take.origin });
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
    range: { ...settings.range },
    origin,
    notes,
    ...summarize(notes),
    duration,
    calibrated: false,
    rubric: 'mono-v1',
  });
  const finish = useCallback((completed = false) => {
    const captured = capture.current;
    if (!captured) return;
    capture.current = null;
    setRecording(false);
    const opts = captured.options;
    const playedUntil = completed ? Infinity : (lastAnchor.current?.tick ?? captured.startTick - 1);
    const expected = expectedNotes(opts.score, opts.track, opts.range, opts.api.current).filter(
      (note) => note.tick <= playedUntil,
    );
    const notes = assess(expected, captured.observations, opts.tempo, captured.startTick);
    const result = {
      ...make(
        'microphone',
        opts,
        notes,
        captured.origin === null ? 0 : performance.now() / 1000 - captured.origin,
      ),
      interrupted: !completed,
    };
    setReview(result);
    // Saving is explicit in the review. Unclear or interrupted takes never alter progress automatically.
  }, []);
  const begin = () => {
    const opts = latest.current;
    const api = opts.api.current;
    if (!api?.isReadyForPlayback) return false;
    const range = playbackRange(api, opts.score, opts.range);
    if (!range) return false;
    api.stop();
    capture.current = {
      observations: [],
      started: performance.now() / 1000,
      origin: null,
      startTick: range.startTick,
      options: { ...opts },
    };
    lastAnchor.current = null;
    setRecording(true);
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
  const save = (take: Take) => {
    if (take.origin === 'example') {
      options.notify('Example takes are for exploring feedback. They do not change your progress.');
      return;
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
    options.notify('Practice history cleared on this device.');
  };
  return {
    takes,
    review,
    setReview,
    recording,
    begin,
    finish,
    onPosition,
    onObservation,
    showExample,
    save,
    clear,
  };
}
