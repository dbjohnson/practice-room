import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlphaTabApi, model } from '@coderline/alphatab';
import type { LoopRange, Page, PlayerStatus, PracticeMode, Take, View } from '../domain/types';
import { useGymStore } from './useGymStore';
import { useGymRunner } from './useGymRunner';
import { useGymActivity } from './useGymActivity';
import { comparisonProfile } from '../domain/gymPlan';
import { exercisePiece } from '../music/exerciseScore';
import type { GymSet, GymView } from '../domain/gym';
import { useLibrary } from './useLibrary';
import { useTakes } from './useTakes';
import { useLatency } from './useLatency';
import { useInstrumentInput } from '../audio/useInstrumentInput';
import { useMidiInput } from '../audio/useMidiInput';
import { useMidiOut } from '../audio/useMidiOut';
import { useAudioDevices } from '../audio/useAudioDevices';
import { normalizeRange } from '../time/timeline';
import { DEFAULT_MIX_EFFECTS, type MixEffects } from '../audio/PlaybackEffects';
import { DEFAULT_SCORE_ZOOM } from './scoreZoom';
import type { RecordAudio } from './useTakeAudio';
import { useTakePlayback } from '../audio/useTakePlayback';
import type { RecordingData } from '../audio/recording';
import { normalizeTranspose, scoreKey, transposeScore } from '../music/transposeScore';
import { useExerciseLoop } from '../audio/useExerciseLoop';
import {
  defaultPieceSettings,
  loadPieceSettings,
  savePieceSettings,
  type PieceSettings,
} from '../storage/pieceSettings';
import { isBoolean, usePersistentState } from '../storage/usePersistentState';

const isMixEffects = (value: unknown) =>
  !!value &&
  ['compression', 'reverb'].every((key) => {
    const amount = (value as Record<string, unknown>)[key];
    return typeof amount === 'number' && amount >= 0 && amount <= 100;
  });

export function useRoomState() {
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  const gymStore = useGymStore(notify);
  const [gymView, setGymView] = useState<GymView>('exercises');
  const sourceLibrary = useLibrary(notify, gymStore.exercises);
  const [transposed, setTransposed] = useState<{
    source: model.Score;
    amount: number;
    score: model.Score;
    warnings: string[];
  } | null>(null);
  const activeTransposition = transposed?.source === sourceLibrary.score ? transposed : null;
  const transpose = activeTransposition?.amount ?? 0;
  const library = {
    ...sourceLibrary,
    score: activeTransposition?.score ?? sourceLibrary.score,
    piece: activeTransposition
      ? { ...sourceLibrary.piece, key: scoreKey(activeTransposition.score).label }
      : sourceLibrary.piece,
    warnings: [...sourceLibrary.warnings, ...(activeTransposition?.warnings ?? [])],
  };
  const applyTranspose = (value: number) => {
    const amount = normalizeTranspose(value);
    try {
      const result = transposeScore(
        sourceLibrary.score,
        amount,
        sourceLibrary.piece.source !== 'import',
      );
      setTransposed(amount ? { source: sourceLibrary.score, amount, ...result } : null);
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not transpose this piece.');
      return false;
    }
  };
  const [page, setPageState] = useState<Page>('practice');
  const [track, setTrack] = useState(0);
  // Tempo, loop range and mix belong to the piece and return when it is reopened.
  // Gym exercises are set up by their routine each time, so they keep nothing.
  const settingsFor = (piece: typeof library.piece) =>
    piece.source === 'exercise'
      ? defaultPieceSettings(piece)
      : loadPieceSettings(piece, library.score.tracks.length);
  const settingsKey = `${library.piece.id}:${library.piece.bpm}:${library.piece.bars}`;
  const fresh = () => ({
    key: settingsKey,
    keep: library.piece.source !== 'exercise',
    ...settingsFor(library.piece),
  });
  const [stored, setStored] = useState(fresh);
  let settings = stored;
  if (stored.key !== settingsKey) {
    settings = fresh();
    setStored(settings);
  }
  const change = useCallback(
    (next: Partial<PieceSettings>) => setStored((current) => ({ ...current, ...next })),
    [],
  );
  useEffect(() => {
    if (stored.keep) savePieceSettings(stored);
  }, [stored]);
  const { tempo, range, muted, volumes } = settings;
  const [soloState, setSoloState] = useState<{ key: string; tracks: number[] }>({
    key: settingsKey,
    tracks: [],
  });
  const solo = useMemo(
    () => (soloState.key === settingsKey ? soloState.tracks : []),
    [soloState, settingsKey],
  );
  const setSolo = (tracks: number[]) => {
    const selected = tracks.slice(-1);
    setSoloState({ key: settingsKey, tracks: selected });
    setStored((current) => ({
      ...current,
      muted: current.muted.filter((track) => !selected.includes(track)),
    }));
  };
  const effectiveMuted = useMemo(
    () =>
      library.score.tracks
        .filter(
          (part) => muted.includes(part.index) || (solo.length > 0 && !solo.includes(part.index)),
        )
        .map((part) => part.index),
    [library.score, muted, solo],
  );
  const setTempo = useCallback((value: number) => change({ tempo: value }), [change]);
  const setRangeState = useCallback((value: LoopRange) => change({ range: value }), [change]);
  const setMuted = useCallback(
    (value: number[]) => {
      change({ muted: value });
      setSoloState((current) => ({
        ...current,
        tracks: current.tracks.filter((track) => !value.includes(track)),
      }));
    },
    [change],
  );
  const setVolumes = useCallback(
    (value: Record<number, number>) => change({ volumes: value }),
    [change],
  );
  const [loop, setLoop] = usePersistentState('loop', true, isBoolean);
  const [view, setView] = useState<View>('both');
  const [zoom, setZoom] = useState(DEFAULT_SCORE_ZOOM);
  const [click, setClick] = usePersistentState('click', false, isBoolean);
  const [clickVolume, setClickVolume] = usePersistentState(
    'click-volume',
    55,
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100,
  );
  const [flash, setFlash] = usePersistentState('flash', false, isBoolean);
  const [countIn, setCountIn] = usePersistentState('countIn', true, isBoolean);
  const [mixEffects, setMixEffectsState] = usePersistentState<MixEffects>(
    'mixEffects',
    { ...DEFAULT_MIX_EFFECTS },
    isMixEffects,
  );
  const setMixEffects = (next: MixEffects | ((current: MixEffects) => MixEffects)) =>
    setMixEffectsState(typeof next === 'function' ? next(mixEffects) : next);
  const [swingOverride, setSwingOverride] = useState<{ score: model.Score; amount: number } | null>(
    null,
  );
  const swing = swingOverride?.score === sourceLibrary.score ? swingOverride.amount : null;
  const setSwing = (amount: number | null) =>
    setSwingOverride(amount === null ? null : { score: sourceLibrary.score, amount });
  const [helpOpen, setHelpOpen] = useState(false);
  const [player, setPlayer] = useState<PlayerStatus>({
    ready: false,
    playing: false,
    rendering: true,
    bar: 1,
    tick: 0,
    totalTicks: 0,
    tracks: [],
    error: null,
  });
  const api = useRef<AlphaTabApi | null>(null);
  const inputLatency = useRef<number | null>(null);
  const reportedLatency = useRef<number | null>(null);
  const takeSource = useRef<'microphone' | 'midi'>('microphone');
  const recordAudio = useRef<RecordAudio | null>(null);
  const takePlayback = useTakePlayback(api, notify);
  const replayGeneration = useRef(0);
  const [pendingReplay, setPendingReplay] = useState<{ take: Take; data: RecordingData } | null>(
    null,
  );
  const setApi = useCallback((value: AlphaTabApi | null) => {
    api.current = value;
  }, []);
  const updatePlayer = useCallback(
    (change: Partial<PlayerStatus>) =>
      setPlayer((p) =>
        Object.entries(change).every(([key, value]) => p[key as keyof PlayerStatus] === value)
          ? p
          : { ...p, ...change },
      ),
    [],
  );
  const gymSet = library.piece.gymSet;
  const gymRun = gymStore.data.run;
  const fullExercise =
    gymSet && range.start === 1 && range.end === library.piece.bars && swing === null;
  const currentGymSet = fullExercise
    ? { ...gymSet, tempo, keyOffset: gymSet.keyOffset + transpose }
    : undefined;
  const gymRunMatches =
    gymRun?.status === 'active' &&
    gymSet?.id === gymRun.queue[gymRun.index].id &&
    gymSet?.exercise.id === gymRun.queue[gymRun.index].exercise.id &&
    tempo === gymSet.tempo &&
    transpose === 0 &&
    comparisonProfile(gymSet) === comparisonProfile(gymRun.queue[gymRun.index]) &&
    fullExercise;
  const takes = useTakes({
    gym: currentGymSet
      ? { set: currentGymSet, runId: gymRunMatches ? gymRun?.id : undefined }
      : undefined,
    onGymTake: gymStore.recordTake,
    piece: library.piece,
    score: library.score,
    track,
    tempo,
    range,
    api,
    notify,
    recordAudio,
    inputLatency,
    reportedLatency,
    source: takeSource,
    swing,
    transpose,
  });
  const input = useInstrumentInput(takes.onObservation);
  // One instrument at a time: an audio interface or a MIDI instrument.
  const midi = useMidiInput(takes.onObservation);
  const midiReady = midi.status.state === 'ready';
  const connected = input.status.state === 'ready' || midiReady;
  const mode: PracticeMode = connected ? 'assess' : 'listen';
  const inputReady = useRef(false);
  inputReady.current = connected;
  takeSource.current = midiReady ? 'midi' : 'microphone';
  // MIDI has nothing to record, and its only delay is the output's.
  recordAudio.current = midiReady ? null : input.record;
  // A cable measurement for this interface wins; otherwise the delay the browser reports
  // for the player's output and this input. MIDI adds no input delay of its own.
  const latency = useLatency({
    api,
    status: midiReady ? { ...input.status, state: 'off', latencyMs: 0 } : input.status,
    observe: input.observe,
    notify,
  });
  const known = latency.known();
  inputLatency.current = known?.source === 'measured' ? known.ms : null;
  reportedLatency.current = known?.source === 'reported' ? known.ms : null;
  const audioDevices = useAudioDevices();
  const midiOut = useMidiOut({
    api,
    score: library.score,
    playing: player.playing,
    tempo,
    range,
    looping: loop,
    silent: effectiveMuted,
    volumes,
    notify,
  });
  const exerciseLoop = useExerciseLoop(
    api,
    {
      position: ({ tick, origin, time }) => {
        takes.onPosition(tick, tempo, origin);
        midiOut.onPosition(tick, time);
        const bar = [...library.score.masterBars]
          .reverse()
          .find((b) => (api.current?.tickCache?.getMasterBarStart(b) ?? b.start) <= tick);
        updatePlayer({ tick, bar: (bar?.index ?? 0) + 1 });
      },
      pass: (ended) => {
        gymActivity.finishLoop(ended);
        takes.finishPass(ended);
      },
      playing: (playing) => updatePlayer({ playing }),
      beat: (at) => updatePlayer({ beatAt: at * 1000 }),
      notify,
      finished: () => {
        takes.finish(true);
        gymActivity.finish();
      },
    },
    click,
    { muted: effectiveMuted, volumes, routed: midiOut.routed },
    clickVolume,
  );
  const pendingControl = useRef<{ tick?: number } | null>(null);
  const nextStart = useRef<{ tick?: number } | null>(null);
  const [controlRevision, setControlRevision] = useState(0);
  const halt = () => {
    pendingControl.current = null;
    nextStart.current = null;
    sourceLibrary.cancelSelection();
    replayGeneration.current++;
    setPendingReplay(null);
    takePlayback.stop(false);
    exerciseLoop.stop();
    updatePlayer({ playing: false });
    api.current?.pause();
    takes.finish();
  };
  const setPage = (next: Page) => {
    if (page !== next) halt();
    if (page === 'instrument' && next !== 'instrument') {
      audioDevices.cancel();
      if (input.status.state === 'connecting') input.stop();
      if (midi.status.state === 'connecting') midi.stop();
    }
    if (next !== 'practice' && next !== 'instrument')
      gymStore.commit((d) =>
        d.run?.status === 'active' ? { ...d, run: { ...d.run, status: 'paused' } } : d,
      );
    setPageState(next);
  };
  const setTranspose = (value: number) => {
    halt();
    return applyTranspose(value);
  };
  const setRange = (next: LoopRange) => {
    halt();
    setRangeState(normalizeRange(next, library.piece.bars));
  };
  useEffect(() => {
    if (takes.recording && !connected) {
      exerciseLoop.stop();
      updatePlayer({ playing: false });
      api.current?.pause();
      takes.finish();
    }
  }, [connected, takes.recording, takes.finish]);
  const openGymSet = async (set: GymSet) => {
    takes.setReview(null);
    if (!(await sourceLibrary.select(exercisePiece(set.exercise, set)))) return false;
    setTransposed(null);
    setTrack(0);
    setTempo(set.tempo);
    setSwing(null);
    // A routine's setup is temporary; it does not replace the player's own preferences.
    setLoop(false, false);
    setCountIn(true, false);
    setClick(true, false);
    setPageState('practice');
    return true;
  };
  const gym = useGymRunner(gymStore, openGymSet, halt, notify);
  useEffect(() => {
    if (gymRun?.status === 'active' && !gymRunMatches && !gym.loading && !library.busy)
      gymStore.commit((d) =>
        d.run?.status === 'active' ? { ...d, run: { ...d.run, status: 'paused' } } : d,
      );
  }, [gymRunMatches, gym.loading, gymRun?.id, gymRun?.status, library.busy]);
  const gymActivity = useGymActivity({
    store: gymStore,
    run: gymRunMatches ? gymRun : null,
    set: currentGymSet,
    playing: player.playing && !connected && !takePlayback.active && page === 'practice',
    tick: player.tick,
    totalTicks: player.totalTicks,
    tempo,
  });
  const play = () => {
    pendingControl.current = null;
    if (exerciseLoop.preparing) {
      halt();
      return;
    }
    if (gymRunMatches && gym.rest > 0) return;
    if (
      library.empty ||
      !player.ready ||
      gym.loading ||
      library.busy ||
      (!!gymSet && api.current?.score !== library.score) ||
      !api.current ||
      takes.audio.processing ||
      pendingReplay ||
      takePlayback.loading
    )
      return;
    if (player.playing) {
      if (takePlayback.active) {
        takePlayback.pauseAudio();
        api.current.pause();
        return;
      }
      halt();
      return;
    }
    const continuation = nextStart.current;
    nextStart.current = null;
    if (loop && !takePlayback.active) {
      void exerciseLoop.start(
        {
          score: library.score,
          recipe: library.piece.source === 'import' ? undefined : library.piece.recipe,
          exerciseArticulation: gymSet?.articulation,
          range,
          routed: midiOut.routed,
          tempo,
          track,
          mode,
          click,
          muted: effectiveMuted,
          volumes,
          effects: mixEffects,
        },
        continuation ? false : countIn,
        swing,
        () => (inputReady.current ? takes.begin(true, true) : true),
        continuation?.tick,
      );
      return;
    }
    if (connected && !takePlayback.active && !takes.begin()) return;
    if (continuation) {
      if (continuation.tick !== undefined && !connected)
        api.current.tickPosition = continuation.tick;
      const saved = api.current.countInVolume;
      api.current.countInVolume = 0;
      api.current.play();
      api.current.countInVolume = saved;
    } else api.current.play();
  };
  const changePlayback = <T>(change: () => T, preservePosition = true) => {
    const continuing = player.playing || exerciseLoop.preparing || pendingControl.current !== null;
    const request = pendingControl.current ?? {
      tick: preservePosition && !takes.recording ? api.current?.tickPosition : undefined,
    };
    halt();
    const result = change();
    if (continuing) pendingControl.current = preservePosition ? request : {};
    setControlRevision((value) => value + 1);
    return result;
  };
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(() => {
    if (!pendingControl.current || !player.ready || takes.audio.processing || library.busy) return;
    const timer = window.setTimeout(() => {
      if (!pendingControl.current) return;
      nextStart.current = pendingControl.current;
      pendingControl.current = null;
      playRef.current();
    }, 220);
    return () => window.clearTimeout(timer);
  }, [controlRevision, player.ready, takes.audio.processing, library.busy]);
  const restart = () => changePlayback(() => api.current?.stop(), false);
  const setLoopLive = (value: boolean) => {
    if (exerciseLoop.active) {
      setLoop(value);
      exerciseLoop.setLooping(value);
    } else if (player.playing || exerciseLoop.preparing) changePlayback(() => setLoop(value));
    else setLoop(value);
  };
  const replayTake = async (take: Take) => {
    halt();
    const token = replayGeneration.current;
    try {
      await takePlayback.prepare();
      const data = await takes.audio.load(take);
      if (!data || token !== replayGeneration.current) return;
      const piece = take.gym
        ? exercisePiece(take.gym.set.exercise, take.gym.set)
        : library.pieces.find((candidate) => candidate.id === take.pieceId);
      if (!piece) {
        notify('Open this take’s music in your library before playing it with the score.');
        return;
      }
      if ((take.gym || piece.id !== library.piece.id) && !(await library.select(piece))) return;
      if (token !== replayGeneration.current) return;
      takes.setReview(null);
      setPageState('practice');
      setTempo(take.tempo);
      setTrack(take.audio?.track ?? 0);
      setRangeState(take.range);
      setPendingReplay({ take, data });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not open the take.');
    }
  };
  useEffect(() => {
    if (!pendingReplay || library.piece.id !== pendingReplay.take.pieceId) return;
    const take = pendingReplay.take;
    const desiredTranspose = normalizeTranspose(take.transpose ?? 0);
    if (transpose !== desiredTranspose) {
      if (!applyTranspose(desiredTranspose)) setPendingReplay(null);
      return;
    }
    const desiredTrack = Math.min(take.audio?.track ?? 0, library.score.tracks.length - 1);
    if (
      track !== desiredTrack ||
      tempo !== take.tempo ||
      range.start !== take.range.start ||
      range.end !== take.range.end
    ) {
      setTrack(desiredTrack);
      setTempo(take.tempo);
      setRangeState(take.range);
      return;
    }
    const desiredSwing = pendingReplay.take.audio?.swing ?? null;
    if (swing !== desiredSwing) {
      setSwing(desiredSwing);
      return;
    }
    // Let a requested rhythm rebuild finish before starting the saved performance.
    const timer = window.setTimeout(() => {
      if (!api.current?.isReadyForPlayback || api.current.score !== library.score) return;
      setPendingReplay(null);
      void takePlayback.start(pendingReplay.data);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    pendingReplay,
    library.piece.id,
    library.score,
    player.ready,
    swing,
    transpose,
    track,
    tempo,
    range,
    mode,
  ]);
  useEffect(() => {
    api.current?.stop();
    takePlayback.stop(false);
    setTrack(0);
  }, [library.piece.id, library.piece.bpm, library.piece.bars]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  return {
    gymStore,
    gym,
    gymActivity,
    exerciseLoop,
    gymView,
    setGymView,
    gymRunMatches: !!gymRunMatches,
    page,
    setPage,
    library,
    tempo,
    setTempo: (value: number) => changePlayback(() => setTempo(value)),
    track,
    setTrack: (value: number) => changePlayback(() => setTrack(value)),
    range,
    setRange: (value: LoopRange) => changePlayback(() => setRange(value), false),
    loop,
    setLoop: setLoopLive,
    view,
    setView,
    zoom,
    setZoom,
    transpose,
    setTranspose: (value: number) => changePlayback(() => setTranspose(value), false),
    mode,
    click,
    setClick,
    clickVolume,
    setClickVolume,
    flash,
    setFlash,
    countIn,
    setCountIn,
    muted,
    effectiveMuted,
    solo,
    setSolo,
    setMuted,
    volumes,
    setVolumes,
    swing,
    setSwing: (value: number | null) => changePlayback(() => setSwing(value)),
    mixEffects,
    setMixEffects: (value: MixEffects | ((current: MixEffects) => MixEffects)) => {
      if (exerciseLoop.active || exerciseLoop.preparing) changePlayback(() => setMixEffects(value));
      else setMixEffects(value);
    },
    player,
    updatePlayer,
    api,
    setApi,
    play,
    restart,
    halt,
    takes,
    input,
    midi,
    midiOut,
    latency,
    inputConnected: connected,
    takePlayback,
    replayTake,
    preparingReplay: !!pendingReplay || takePlayback.loading,
    audioDevices,
    helpOpen,
    setHelpOpen,
    toast,
    notify,
  };
}
