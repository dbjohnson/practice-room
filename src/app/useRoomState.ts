import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useInstrumentInput } from '../audio/useInstrumentInput';
import { useAudioDevices } from '../audio/useAudioDevices';
import { normalizeRange } from '../time/timeline';
import { DEFAULT_MIX_EFFECTS, type MixEffects } from '../audio/PlaybackEffects';
import { DEFAULT_SCORE_ZOOM } from './scoreZoom';
import type { RecordAudio } from './useTakeAudio';
import { useTakePlayback } from '../audio/useTakePlayback';
import type { RecordingData } from '../audio/recording';
import { normalizeTranspose, scoreKey, transposeScore } from '../music/transposeScore';
import { useExerciseLoop } from '../audio/useExerciseLoop';

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
  const [tempo, setTempo] = useState(72);
  const [track, setTrack] = useState(0);
  const [range, setRangeState] = useState<LoopRange>({ start: 1, end: library.piece.bars });
  const [loop, setLoop] = useState(true);
  const [view, setView] = useState<View>('both');
  const [zoom, setZoom] = useState(DEFAULT_SCORE_ZOOM);
  const [mode, setModeState] = useState<PracticeMode>('listen');
  const [click, setClick] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [muted, setMuted] = useState<number[]>([]);
  const [volumes, setVolumes] = useState<Record<number, number>>({});
  const [mixEffects, setMixEffects] = useState<MixEffects>({ ...DEFAULT_MIX_EFFECTS });
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
    swing,
    transpose,
  });
  const input = useInstrumentInput(takes.onObservation);
  const inputReady = useRef(false);
  inputReady.current = input.status.state === 'ready';
  recordAudio.current = input.record;
  inputLatency.current = input.calibration?.offsetMs ?? null;
  const audioDevices = useAudioDevices();
  const exerciseLoop = useExerciseLoop(
    api,
    {
      position: ({ tick, origin }) => {
        takes.onPosition(tick, tempo, origin);
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
    },
    click,
  );
  const halt = () => {
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
  const setMode = (next: PracticeMode) => {
    halt();
    setModeState(next);
    if (next === 'assess' && input.status.state !== 'ready') setPage('instrument');
  };
  useEffect(() => {
    if (takes.recording && input.status.state !== 'ready') {
      exerciseLoop.stop();
      updatePlayer({ playing: false });
      api.current?.pause();
      takes.finish();
    }
  }, [input.status.state, takes.recording, takes.finish]);
  const openGymSet = async (set: GymSet) => {
    takes.setReview(null);
    if (!(await sourceLibrary.select(exercisePiece(set.exercise, set)))) return false;
    setTransposed(null);
    setTrack(0);
    setTempo(set.tempo);
    setSwing(null);
    setLoop(false);
    setCountIn(true);
    setClick(true);
    setModeState(input.status.state === 'ready' ? 'assess' : 'along');
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
    playing: player.playing && mode === 'along' && !takePlayback.active && page === 'practice',
    tick: player.tick,
    totalTicks: player.totalTicks,
    tempo,
  });
  const play = () => {
    if (exerciseLoop.preparing) {
      halt();
      return;
    }
    if (gymRunMatches && gym.rest > 0) return;
    if (
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
    if (
      gymSet &&
      range.start === 1 &&
      range.end === library.piece.bars &&
      loop &&
      !takePlayback.active
    ) {
      if (mode === 'assess' && input.status.state !== 'ready') {
        setPage('instrument');
        return;
      }
      void exerciseLoop.start(
        {
          score: library.score,
          recipe: library.piece.source === 'import' ? undefined : library.piece.recipe,
          exerciseArticulation: gymSet.articulation,
          tempo,
          track,
          mode,
          click,
          muted,
          volumes,
          effects: mixEffects,
        },
        countIn,
        swing,
        () =>
          mode === 'listen'
            ? true
            : inputReady.current
              ? takes.begin(mode === 'assess', true)
              : mode !== 'assess',
      );
      return;
    }
    if (mode === 'assess' && !takePlayback.active) {
      if (input.status.state !== 'ready') {
        setPage('instrument');
        return;
      }
      if (!takes.begin()) return;
    } else if (
      mode === 'along' &&
      gymSet &&
      input.status.state === 'ready' &&
      !takePlayback.active
    ) {
      if (!takes.begin(false)) return;
    }
    api.current.play();
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
      setModeState('along');
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
      range.end !== take.range.end ||
      mode !== 'along'
    ) {
      setTrack(desiredTrack);
      setTempo(take.tempo);
      setRangeState(take.range);
      setModeState('along');
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
    setTempo(library.piece.bpm);
    setRangeState({ start: 1, end: library.piece.bars });
    setMuted([]);
    setVolumes({});
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
    setTempo,
    track,
    setTrack,
    range,
    setRange,
    loop,
    setLoop,
    view,
    setView,
    zoom,
    setZoom,
    transpose,
    setTranspose,
    mode,
    setMode,
    click,
    setClick,
    countIn,
    setCountIn,
    muted,
    setMuted,
    volumes,
    setVolumes,
    swing,
    setSwing,
    mixEffects,
    setMixEffects,
    player,
    updatePlayer,
    api,
    setApi,
    play,
    halt,
    takes,
    input,
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
