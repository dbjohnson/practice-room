import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AlphaTabApi } from '@coderline/alphatab';
import { ExerciseLoopPlayer, type LoopPosition } from './ExerciseLoopPlayer';
import type { ExerciseLoopOptions } from './exerciseLoopBuffer';
import { renderLoopStems } from './renderLoopStems';
import type { LoopMix } from './TrackLoopSources';

export function useExerciseLoop(
  api: RefObject<AlphaTabApi | null>,
  callbacks: {
    position: (position: LoopPosition) => void;
    pass: (ended: number) => void;
    playing: (playing: boolean) => void;
    notify: (message: string) => void;
    beat?: (at: number) => void;
    finished?: () => void;
  },
  clickEnabled: boolean,
  mix?: LoopMix,
  clickVolume = 55,
) {
  const liveMix = useRef(mix);
  liveMix.current = mix;
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const click = useRef({ enabled: clickEnabled, volume: clickVolume });
  click.current = { enabled: clickEnabled, volume: clickVolume };
  const [active, setActive] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const player = useRef<ExerciseLoopPlayer | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cache = useRef<{
    score: ExerciseLoopOptions['score'];
    key: string;
    audio: Awaited<ReturnType<typeof renderLoopStems>>;
  } | null>(null);
  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    player.current?.stop();
    setActive(false);
    setPreparing(false);
  };
  const start = async (
    options: ExerciseLoopOptions,
    countIn: boolean,
    swing: number | null,
    begin: () => boolean,
    startTick?: number,
  ) => {
    stop();
    const request = new AbortController();
    controller.current = request;
    setPreparing(true);
    try {
      player.current ??= new ExerciseLoopPlayer(new AudioContext());
      const loop = player.current;
      await loop.context.resume();
      const currentApi = api.current;
      if (!currentApi) return;
      // Invalidate buffers from the old exporter when this dev module refreshes.
      const key = JSON.stringify([
        'shared-synth-v2',
        options.tempo,
        options.effects,
        options.range,
        swing,
      ]);
      const audio =
        cache.current?.score === options.score && cache.current.key === key
          ? cache.current.audio
          : await renderLoopStems(currentApi, options, loop.context, request.signal);
      request.signal.throwIfAborted();
      cache.current = { score: options.score, key, audio };
      await loop.prepareClick(request.signal);
      request.signal.throwIfAborted();
      if (!begin()) return;
      currentApi.pause();
      currentApi.tickPosition = audio.timing?.startTick ?? 0;
      loop.setClick(click.current.enabled, click.current.volume);
      loop.startLoop(
        audio.buffer,
        audio.end,
        options.tempo,
        countIn,
        (position) => {
          currentApi.tickPosition = position.tick;
          latest.current.position(position);
        },
        (ended) => latest.current.pass(ended),
        (at) => latest.current.beat?.(at),
        audio.timing,
        audio.stems,
        liveMix.current ?? options,
        startTick === undefined
          ? 0
          : Math.max(
              0,
              Math.min(
                audio.buffer.duration - 0.001,
                audio.timing.secondsAt?.(Math.max(audio.timing.startTick, startTick)) ?? 0,
              ),
            ),
        () => {
          setActive(false);
          latest.current.playing(false);
          latest.current.finished?.();
        },
      );
      setActive(true);
      latest.current.playing(true);
    } catch (error) {
      if (!request.signal.aborted)
        latest.current.notify(
          error instanceof Error ? error.message : 'Could not prepare the exercise loop.',
        );
    } finally {
      if (controller.current === request) setPreparing(false);
    }
  };
  useEffect(() => {
    if (mix) player.current?.setMix(mix);
  }, [mix]);
  useEffect(() => {
    player.current?.setClick(clickEnabled, clickVolume);
  }, [clickEnabled, clickVolume]);
  useEffect(
    () => () => {
      controller.current?.abort();
      player.current?.stop();
      if (player.current) void player.current.context.close();
    },
    [],
  );
  return {
    active,
    preparing,
    start,
    stop,
    setLooping: (value: boolean) => player.current?.setLooping(value),
  };
}
