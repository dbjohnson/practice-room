import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlphaTabApi, midi, model } from '@coderline/alphatab';
import type { LoopRange } from '../domain/types';
import { playbackRange, secondsBetween } from '../music/scoreTimeline';
import { usePersistentState } from '../storage/usePersistentState';
import { ticksToSeconds } from '../time/timeline';
import { playerContext, reportedOutputLatency } from './playerLatency';
import { midiAccessError, requestMidi, type MidiDevice } from './midiInput';
import { fileEvents, MidiOutScheduler, type MidiRoute } from './midiOut';

interface MidiOutOptions {
  api: React.RefObject<AlphaTabApi | null>;
  score: model.Score;
  playing: boolean;
  tempo: number;
  range: LoopRange;
  looping: boolean;
  /** Tracks that should be silent: muted by the player, or the part being played along. */
  silent: number[];
  volumes: Record<number, number>;
  notify: (message: string) => void;
}
type Routes = Record<string, MidiRoute>;
const isRoutes = (value: unknown) =>
  !!value &&
  typeof value === 'object' &&
  Object.values(value as Routes).every(
    (route) =>
      typeof route?.outputId === 'string' &&
      Number.isInteger(route.channel) &&
      route.channel >= 1 &&
      route.channel <= 16,
  );

// Plays chosen parts on instrument plugins (a sampler, drum or piano plugin hosted in
// another program) by sending their notes to a MIDI output instead of the built-in sounds.
// Routes follow the part's name, so "Studio drums" keeps its plugin in every jam.
export function useMidiOut(options: MidiOutOptions) {
  const latest = useRef(options);
  latest.current = options;
  const [routes, setRoutes] = usePersistentState<Routes>('midiRoutes', {}, isRoutes);
  const [outputs, setOutputs] = useState<MidiDevice[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const access = useRef<MIDIAccess | null>(null);
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const [scheduler] = useState(
    () =>
      new MidiOutScheduler(
        (outputId, data, at) => access.current?.outputs.get(outputId)?.send(data, at * 1000),
        (from, to) => {
          const { api, score, tempo } = latest.current;
          const cache = api.current?.tickCache;
          return cache
            ? secondsBetween(cache, from, to) / (tempo / score.tempo)
            : ticksToSeconds(to - from, tempo);
        },
      ),
  );
  const discover = useCallback(async () => {
    try {
      const granted = access.current ?? (await requestMidi());
      access.current = granted;
      const list = () =>
        setOutputs(
          [...granted.outputs.values()]
            .filter((output) => output.state !== 'disconnected')
            .map((output, i) => ({ id: output.id, label: output.name || `MIDI output ${i + 1}` })),
        );
      granted.addEventListener('statechange', list);
      list();
      setAuthorized(true);
    } catch (error) {
      latest.current.notify(midiAccessError(error));
    }
  }, []);
  const route = useCallback((track: number): MidiRoute | null => {
    const name = latest.current.score.tracks[track]?.name;
    const found = name ? routesRef.current[name] : undefined;
    return found && access.current?.outputs.get(found.outputId)?.state === 'connected'
      ? found
      : null;
  }, []);
  const setRoute = (trackName: string, next: MidiRoute | null) => {
    scheduler.stop(performance.now() / 1000);
    const { [trackName]: _removed, ...rest } = routes;
    void _removed;
    setRoutes(next ? { ...rest, [trackName]: next } : rest);
  };
  // Saved routes need MIDI access again after a reload; ask only if any exist.
  const hasRoutes = Object.keys(routes).length > 0;
  useEffect(() => {
    if (hasRoutes && !access.current) void discover();
  }, [hasRoutes, discover]);
  // The player shapes its MIDI after generating it (feel, articulation, swing), so the
  // notes are taken from what it will actually play rather than from the score.
  const [file, setFile] = useState<midi.MidiFile | null>(null);
  useEffect(() => {
    scheduler.load(hasRoutes && file ? fileEvents(file) : [], performance.now() / 1000);
  }, [scheduler, file, hasRoutes]);
  const onMidi = useCallback((next: midi.MidiFile) => setFile(next), []);
  useEffect(() => {
    if (!options.playing || !hasRoutes) return;
    const timer = window.setInterval(() => {
      const { api, score, range, looping, silent, volumes } = latest.current;
      scheduler.pump(performance.now() / 1000, {
        route,
        level: (track) => (silent.includes(track) ? 0 : (volumes[track] ?? 80) / 80),
        latency: reportedOutputLatency(playerContext(api.current)),
        range: api.current ? playbackRange(api.current, score, range) : null,
        looping,
      });
    }, 25);
    return () => {
      window.clearInterval(timer);
      scheduler.stop(performance.now() / 1000);
    };
  }, [scheduler, options.playing, hasRoutes, route]);
  const onPosition = useCallback(
    (tick: number) => scheduler.position(tick, performance.now() / 1000),
    [scheduler],
  );
  /** Track indexes whose built-in sound is replaced by a connected output. */
  const routed = options.score.tracks
    .filter((track) => {
      const found = routes[track.name];
      return !!found && outputs.some((output) => output.id === found.outputId);
    })
    .map((track) => track.index);
  return { outputs, authorized, discover, routes, setRoute, routed, onPosition, onMidi };
}
