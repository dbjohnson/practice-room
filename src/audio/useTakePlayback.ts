import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { AlphaTabApi } from '@coderline/alphatab';
import { recordingCoordinate, type RecordingData } from './recording';

/** The score clock drives recorded audio too, including pause, seek and loop jumps. */
export function useTakePlayback(
  api: RefObject<AlphaTabApi | null>,
  notify: (message: string) => void,
) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [withBacking, setWithBacking] = useState(true);
  const context = useRef<AudioContext | null>(null);
  const generation = useRef(0);
  const playback = useRef<{
    data: RecordingData;
    buffer: AudioBuffer;
    source: AudioBufferSourceNode | null;
    started: number;
    offset: number;
  } | null>(null);
  const pauseAudio = useCallback(() => {
    const current = playback.current;
    if (current?.source) {
      current.source.onended = null;
      current.source.stop();
      current.source.disconnect();
      current.source = null;
    }
  }, []);
  const stop = useCallback(
    (pausePlayer = true) => {
      generation.current++;
      pauseAudio();
      playback.current = null;
      setActive(false);
      setLoading(false);
      if (pausePlayer) api.current?.pause();
    },
    [api, pauseAudio],
  );
  const prepare = async () => {
    context.current ??= new AudioContext();
    await context.current.resume();
  };
  const start = async (data: RecordingData) => {
    stop();
    const token = generation.current;
    setLoading(true);
    try {
      await prepare();
      const buffer = await context.current!.decodeAudioData(await data.blob.arrayBuffer());
      if (token !== generation.current || !api.current?.isReadyForPlayback) return;
      playback.current = { data, buffer, source: null, started: 0, offset: 0 };
      setActive(true);
      api.current.countInVolume = 0;
      api.current.isLooping = false;
      api.current.tickPosition = data.timeline[0]?.tick ?? 0;
      api.current.play();
    } catch (error) {
      if (token === generation.current) {
        stop();
        notify(error instanceof Error ? error.message : 'Could not play the recording.');
      }
    } finally {
      if (token === generation.current) setLoading(false);
    }
  };
  const onPosition = useCallback(
    (tick: number) => {
      const current = playback.current;
      const ctx = context.current;
      if (!current || !ctx || api.current?.playerState !== 1) return;
      const offset = recordingCoordinate(current.data.timeline, tick, 'tick');
      if (offset >= current.buffer.duration) {
        stop();
        return;
      }
      const actual = current.offset + ctx.currentTime - current.started;
      if (current.source && Math.abs(actual - offset) < 0.12) return;
      pauseAudio();
      const source = ctx.createBufferSource();
      source.buffer = current.buffer;
      source.connect(ctx.destination);
      current.source = source;
      current.offset = offset;
      current.started = ctx.currentTime;
      source.onended = () => {
        if (playback.current === current && current.source === source) stop();
      };
      source.start(ctx.currentTime, offset);
    },
    [api, pauseAudio, stop],
  );
  useEffect(
    () => () => {
      generation.current++;
      pauseAudio();
      playback.current = null;
      if (context.current) void context.current.close();
      context.current = null;
    },
    [pauseAudio],
  );
  return {
    active,
    loading,
    withBacking,
    setWithBacking,
    prepare,
    start,
    stop,
    pauseAudio,
    onPosition,
  };
}
