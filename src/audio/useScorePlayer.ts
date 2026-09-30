import { useEffect, useRef } from 'react';
import {
  AlphaTabApi,
  NotationElement,
  PlayerMode,
  StaveProfile,
  ScrollMode,
  type model,
} from '@coderline/alphatab';
import type { LoopRange, PlayerStatus, PracticeMode, View } from '../domain/types';
import { playbackRange } from '../music/scoreTimeline';

export interface PlayerOptions {
  score: model.Score;
  track: number;
  tempo: number;
  range: LoopRange;
  loop: boolean;
  view: View;
  mode: PracticeMode;
  click: boolean;
  countIn: boolean;
  muted: number[];
  volumes: Record<number, number>;
  onStatus: (change: Partial<PlayerStatus>) => void;
  onReady: (api: AlphaTabApi | null) => void;
  onFinish: () => void;
  onPosition: (tick: number, bpm: number, time: number) => void;
}

export function useScorePlayer(options: PlayerOptions) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!host.current) return;
    const api = new AlphaTabApi(host.current, {
      core: { enableLazyLoading: false, fontDirectory: `${import.meta.env.BASE_URL}font/` },
      display: {
        scale: 1,
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
        soundFont: `${import.meta.env.BASE_URL}soundfont/sonivox.sf2`,
        enableCursor: true,
        enableElementHighlighting: true,
        enableUserInteraction: true,
        scrollMode: ScrollMode.OffScreen,
        scrollElement: host.current.parentElement!,
        scrollOffsetY: -30,
      },
    });
    apiRef.current = api;
    latest.current.onReady(api);
    api.error.on((error) => latest.current.onStatus({ error: error.message, rendering: false }));
    api.renderStarted.on(() => latest.current.onStatus({ rendering: true }));
    api.renderFinished.on(() => latest.current.onStatus({ rendering: false }));
    api.playerReady.on(() => {
      latest.current.onStatus({ ready: true, totalTicks: api.endTick, error: null });
      configure(api, latest.current, true);
    });
    api.playerStateChanged.on((e) => latest.current.onStatus({ playing: e.state === 1 }));
    api.playerPositionChanged.on((e) => {
      latest.current.onStatus({ tick: e.currentTick });
      // The synth emits non-seek positions only during the actual music, after count-in.
      if (!e.isSeek) latest.current.onPosition(e.currentTick, e.modifiedTempo, e.currentTime);
    });
    api.playedBeatChanged.on((beat) => {
      latest.current.onStatus({ bar: beat.voice.bar.index + 1 });
    });
    api.playerFinished.on(() => latest.current.onFinish());
    return () => {
      latest.current.onReady(null);
      apiRef.current = null;
      api.destroy();
    };
  }, []);

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
      options.view === 'score'
        ? StaveProfile.Score
        : options.view === 'tab'
          ? StaveProfile.Tab
          : StaveProfile.ScoreTab;
    if (api.settings.display.staveProfile === profile) return;
    api.settings.display.staveProfile = profile;
    api.updateSettings();
    api.render();
  }, [options.view]);

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
  ]);
  return host;
}

function configure(api: AlphaTabApi, options: PlayerOptions, forceRange = false) {
  api.playbackSpeed = options.tempo / options.score.tempo;
  api.isLooping = options.loop && options.mode !== 'assess';
  api.metronomeVolume = options.click ? 0.55 : 0;
  api.countInVolume = options.countIn ? 0.6 : 0;
  const range = playbackRange(api, options.score, options.range);
  if (
    range &&
    (forceRange ||
      api.playbackRange?.startTick !== range.startTick ||
      api.playbackRange?.endTick !== range.endTick)
  )
    api.playbackRange = range;
  for (const track of options.score.tracks) {
    api.changeTrackMute(
      [track],
      options.muted.includes(track.index) ||
        (options.mode !== 'listen' && options.track === track.index),
    );
    api.changeTrackVolume([track], (options.volumes[track.index] ?? 80) / 100);
  }
}
