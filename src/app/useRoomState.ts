import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlphaTabApi } from '@coderline/alphatab';
import type { Concept, LoopRange, Page, PlayerStatus, PracticeMode, View } from '../domain/types';
import { useLibrary } from './useLibrary';
import { useTakes } from './useTakes';
import { useInstrumentInput } from '../audio/useInstrumentInput';
import { useAudioDevices } from '../audio/useAudioDevices';
import { normalizeRange } from '../time/timeline';
import { readLocal, writeLocal } from '../storage/library';

export function useRoomState() {
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  const library = useLibrary(notify);
  const [concept, setConceptState] = useState<Concept>(() => {
    const c = readLocal<string>('concept', 'phrase');
    return ['phrase', 'trail', 'pocket'].includes(c) ? (c as Concept) : 'phrase';
  });
  const [page, setPageState] = useState<Page>('practice');
  const [tempo, setTempo] = useState(72);
  const [track, setTrack] = useState(0);
  const [range, setRangeState] = useState<LoopRange>({ start: 1, end: 4 });
  const [loop, setLoop] = useState(true);
  const [view, setView] = useState<View>('both');
  const [mode, setModeState] = useState<PracticeMode>('listen');
  const [click, setClick] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [muted, setMuted] = useState<number[]>([]);
  const [volumes, setVolumes] = useState<Record<number, number>>({});
  const [helpOpen, setHelpOpen] = useState(false);
  const [mission, setMission] = useState(0);
  const [completedMissions, setCompletedMissions] = useState<number[]>([]);
  const [challenge, setChallenge] = useState('Learn the part');
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
  const setApi = useCallback((value: AlphaTabApi | null) => {
    api.current = value;
  }, []);
  const updatePlayer = useCallback(
    (change: Partial<PlayerStatus>) => setPlayer((p) => ({ ...p, ...change })),
    [],
  );
  const takes = useTakes({
    piece: library.piece,
    score: library.score,
    track,
    tempo,
    range,
    api,
    notify,
  });
  const input = useInstrumentInput(takes.onObservation);
  const audioDevices = useAudioDevices();
  const halt = () => {
    api.current?.pause();
    takes.finish();
  };
  const setPage = (next: Page) => {
    if (page !== next) halt();
    if (page === 'instrument' && next !== 'instrument') {
      audioDevices.cancel();
      if (input.status.state === 'connecting') input.stop();
    }
    setPageState(next);
  };
  const setConcept = (next: Concept) => {
    setConceptState(next);
    writeLocal('concept', next);
    setPage('practice');
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
      api.current?.pause();
      takes.finish();
    }
  }, [input.status.state, takes.recording, takes.finish]);
  const play = () => {
    if (!player.ready || !api.current) return;
    if (player.playing) {
      halt();
      return;
    }
    if (mode === 'assess') {
      if (input.status.state !== 'ready') {
        setPage('instrument');
        return;
      }
      if (!takes.begin()) return;
    }
    api.current.play();
  };
  useEffect(() => {
    api.current?.stop();
    setTrack(0);
    setTempo(library.piece.bpm);
    setRangeState({ start: 1, end: Math.min(4, library.piece.bars) });
    setMuted([]);
    setVolumes({});
    setMission(0);
    setCompletedMissions([]);
  }, [library.piece.id, library.piece.bpm, library.piece.bars]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  return {
    concept,
    setConcept,
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
    player,
    updatePlayer,
    api,
    setApi,
    play,
    halt,
    takes,
    input,
    audioDevices,
    helpOpen,
    setHelpOpen,
    toast,
    notify,
    mission,
    setMission,
    completedMissions,
    setCompletedMissions,
    challenge,
    setChallenge,
  };
}
