import { useEffect, useRef } from 'react';
import {
  AlphaTabApi,
  NotationElement,
  PlayerMode,
  StaveProfile,
  ScrollMode,
  midi,
  type model,
} from '@coderline/alphatab';
import type { JamRecipe, LoopRange, PlayerStatus, PracticeMode, View } from '../domain/types';
import { configurePlayer as configure } from './configurePlayer';
import { exercisePlayback } from './exercisePlayback';
import type { ExerciseArticulation } from '../domain/gym';
import { naturalPlayback } from './naturalPlayback';
import { loadScoreSamples } from './loadScoreSamples';
import { attachPlaybackEffects } from './attachPlaybackEffects';
import { useSwingPlayback } from './useSwingPlayback';
import type { MixEffects } from './PlaybackEffects';
import { hideScoreBranding } from './hideScoreBranding';

export interface PlayerOptions {
  score: model.Score;
  recipe?: JamRecipe;
  exerciseArticulation?: ExerciseArticulation;
  track: number;
  tempo: number;
  range: LoopRange;
  loop: boolean;
  view: View;
  zoom: number;
  mode: PracticeMode;
  click: boolean;
  countIn: boolean;
  muted: number[];
  volumes: Record<number, number>;
  effects: MixEffects;
  swing: number | null;
  replaying: boolean;
  replayBacking: boolean;
  externalClock?: boolean;
  onStatus: (change: Partial<PlayerStatus>) => void;
  onReady: (api: AlphaTabApi | null) => void;
  onFinish: () => void;
  onPosition: (tick: number, bpm: number, time: number) => void;
}

export function useScorePlayer(options: PlayerOptions) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const effectsRef = useRef<ReturnType<typeof attachPlaybackEffects> | null>(null);
  const hasTab =
    options.score.tracks[options.track]?.staves.some((staff) => staff.tuning.length > 0) ?? false;
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!host.current) return;
    const api = new AlphaTabApi(host.current, {
      core: { enableLazyLoading: false, fontDirectory: `${import.meta.env.BASE_URL}font/` },
      display: {
        scale: latest.current.zoom / 100,
        barsPerRow: 4,
        staveProfile: StaveProfile.ScoreTab,
        padding: [24, 22, 20, 22],
      },
      notation: {
        elements: new Map(
          [
            NotationElement.ScoreTitle,
            NotationElement.ScoreSubTitle,
            NotationElement.ScoreArtist,
            NotationElement.ScoreAlbum,
            NotationElement.ScoreWords,
            NotationElement.ScoreMusic,
            NotationElement.ScoreWordsAndMusic,
            NotationElement.ScoreCopyright,
          ].map((element) => [element, false]),
        ),
      },
      player: {
        playerMode: PlayerMode.EnabledSynthesizer,
        enableCursor: true,
        enableElementHighlighting: true,
        enableUserInteraction: true,
        scrollMode: ScrollMode.Continuous,
        scrollElement: host.current.closest<HTMLElement>('.score-paper')!,
        scrollOffsetY: -8,
        nativeBrowserSmoothScroll: false,
        scrollSpeed: 0,
      },
    });
    apiRef.current = api;
    let sounds = new AbortController();
    let soundsStarted = false;
    let samplesReady = false;
    const loadSounds = () => {
      if (sounds.signal.aborted || soundsStarted) return;
      soundsStarted = true;
      const score = latest.current.score;
      const request = sounds;
      void loadScoreSamples(
        `${import.meta.env.BASE_URL}soundfont/`,
        __RECORDED_BANK_VERSION__,
        latest.current,
        api.settings,
        request.signal,
      )
        .then((bank) => {
          if (!request.signal.aborted && api.score === score) {
            samplesReady = true;
            api.loadSoundFont(bank, false);
          }
        })
        .catch((error: unknown) => {
          if (!request.signal.aborted)
            latest.current.onStatus({
              error: error instanceof Error ? error.message : 'Instrument sounds could not load.',
            });
        });
    };
    latest.current.onReady(api);
    api.midiEventsPlayedFilter = [midi.MidiEventType.AlphaTabMetronome];
    api.midiEventsPlayed.on((event) => {
      if (
        !latest.current.externalClock &&
        event.events.some((e) => e.type === midi.MidiEventType.AlphaTabMetronome)
      )
        latest.current.onStatus({ beatAt: performance.now() });
    });
    api.error.on((error) => latest.current.onStatus({ error: error.message, rendering: false }));
    api.renderStarted.on(() => latest.current.onStatus({ rendering: true }));
    api.renderFinished.on(() => {
      latest.current.onStatus({ rendering: false });
      // Paint the notation before starting sample downloads and audio decoding.
      requestAnimationFrame(() => requestAnimationFrame(loadSounds));
    });
    api.postRenderFinished.on(() => {
      if (host.current) hideScoreBranding(host.current);
    });
    api.playerReady.on(() => {
      effectsRef.current ??= attachPlaybackEffects(api.player!.output);
      effectsRef.current.configure(latest.current.effects);
      latest.current.onStatus({
        ready: samplesReady,
        instrumentsReady: samplesReady,
        totalTicks: api.endTick,
        error: null,
      });
      // alphaTab resets the displayed track's mix volume after this event returns.
      queueMicrotask(() => {
        if (apiRef.current === api && api.score === latest.current.score)
          configure(api, latest.current, true);
      });
    });
    api.midiLoad.on((file) => {
      if (api.score === latest.current.score) {
        sounds.abort();
        sounds = new AbortController();
        soundsStarted = samplesReady = false;
        latest.current.onStatus({ ready: false, instrumentsReady: false });
        naturalPlayback(file, latest.current.recipe);
        exercisePlayback(file, latest.current.exerciseArticulation);
        // Rhythm changes also regenerate MIDI without replacing the score object.
        requestAnimationFrame(() => requestAnimationFrame(loadSounds));
      }
    });
    api.playerStateChanged.on((e) => latest.current.onStatus({ playing: e.state === 1 }));
    let lastVisualPosition = -Infinity;
    api.playerPositionChanged.on((e) => {
      const now = performance.now();
      if (e.isSeek || now - lastVisualPosition >= 50) {
        latest.current.onStatus({ tick: e.currentTick });
        lastVisualPosition = now;
      }
      // The synth emits non-seek positions only during the actual music, after count-in.
      if (!e.isSeek) latest.current.onPosition(e.currentTick, e.modifiedTempo, e.currentTime);
      // A continuous exercise source owns audio while alphaTab follows by seek.
      // Scroll after alphaTab's queued cursor update has placed the new beat.
      if (e.isSeek && latest.current.externalClock)
        requestAnimationFrame(() => {
          if (latest.current.externalClock) api.scrollToCursor();
        });
    });
    api.playedBeatChanged.on((beat) => {
      latest.current.onStatus({ bar: beat.voice.bar.index + 1 });
    });
    api.playerFinished.on(() => latest.current.onFinish());
    return () => {
      sounds.abort();
      effectsRef.current?.dispose();
      effectsRef.current = null;
      latest.current.onReady(null);
      apiRef.current = null;
      api.destroy();
    };
  }, []);

  useEffect(() => {
    effectsRef.current?.configure(options.effects);
  }, [options.effects]);

  useSwingPlayback(apiRef, latest, options.score, options.swing);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.stop();
    options.onStatus({ ready: false, playing: false, bar: 1, tick: 0, error: null });
    api.load(options.score, [options.track]);
    options.onStatus({
      tracks: options.score.tracks.map((track) => ({
        index: track.index,
        name: track.name,
        percussion: track.isPercussion,
        tuning: track.staves[0]?.tuning ?? [],
      })),
    });
    // Score replacement owns the load; track switching uses renderTracks below.
  }, [options.score]);

  useEffect(() => {
    const api = apiRef.current;
    const track = options.score.tracks[options.track];
    if (api && track && api.tracks[0] !== track) api.renderTracks([track]);
  }, [options.score, options.track]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const profile =
      options.view === 'score' || !hasTab
        ? StaveProfile.Score
        : options.view === 'tab'
          ? StaveProfile.Tab
          : StaveProfile.ScoreTab;
    const resize = () => {
      const scale = options.zoom / 100;
      const width = host.current?.clientWidth ?? 1040;
      if (width === 0) return;
      const bars = Math.max(1, Math.round(Math.min(4, width / 260) / scale));
      const display = api.settings.display;
      if (
        display.staveProfile === profile &&
        display.scale === scale &&
        display.barsPerRow === bars
      )
        return;
      display.staveProfile = profile;
      display.scale = scale;
      display.barsPerRow = bars;
      api.updateSettings();
      api.render();
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, [options.view, options.zoom, hasTab]);

  useEffect(() => {
    if (apiRef.current) configure(apiRef.current, options);
  }, [
    options.tempo,
    options.loop,
    options.range.start,
    options.range.end,
    options.mode,
    options.click,
    options.countIn,
    options.track,
    options.muted,
    options.volumes,
    options.score,
    options.replaying,
    options.replayBacking,
  ]);
  return host;
}
