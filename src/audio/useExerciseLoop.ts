import { useEffect, useRef, useState, type RefObject } from 'react';
import type { AlphaTabApi } from '@coderline/alphatab';
import { ExerciseLoopPlayer, type LoopPosition } from './ExerciseLoopPlayer';
import { renderExerciseLoop, type ExerciseLoopOptions } from './exerciseLoopBuffer';

export function useExerciseLoop(
  api: RefObject<AlphaTabApi | null>,
  callbacks: {
    position: (position: LoopPosition) => void;
    pass: (ended: number) => void;
    playing: (playing: boolean) => void;
    notify: (message: string) => void;
    beat?: (at: number) => void;
  },
  clickEnabled: boolean,
) {
  const latest = useRef(callbacks);
  latest.current = callbacks;
  const click = useRef(clickEnabled);
  click.current = clickEnabled;
  const [active, setActive] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const player = useRef<ExerciseLoopPlayer | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cache = useRef<{
    score: ExerciseLoopOptions['score'];
    key: string;
    audio: Awaited<ReturnType<typeof renderExerciseLoop>>;
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
      const key = JSON.stringify([
        options.tempo,
        options.track,
        options.mode,
        options.muted,
        options.volumes,
        options.effects,
        swing,
      ]);
      const audio =
        cache.current?.score === options.score && cache.current.key === key
          ? cache.current.audio
          : await renderExerciseLoop(currentApi, options, loop.context, request.signal);
      request.signal.throwIfAborted();
      cache.current = { score: options.score, key, audio };
      await loop.prepareClick(request.signal);
      request.signal.throwIfAborted();
      if (!begin()) return;
      currentApi.pause();
      currentApi.tickPosition = 0;
      loop.setClick(click.current);
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
    player.current?.setClick(clickEnabled);
  }, [clickEnabled]);
  useEffect(
    () => () => {
      controller.current?.abort();
      player.current?.stop();
      if (player.current) void player.current.context.close();
    },
    [],
  );
  return { active, preparing, start, stop };
}
