import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlphaTabApi,
  NotationElement,
  PlayerMode,
  ScrollMode,
  StaveProfile,
  type model,
} from '@coderline/alphatab';
import { hideScoreBranding } from './hideScoreBranding';
import { loadScoreSamples } from './loadScoreSamples';

export interface PreviewStatus {
  rendering: boolean;
  /** True once the sounds this score needs are loaded and it can play. */
  ready: boolean;
  playing: boolean;
  error: string | null;
}

const profileOf = (track: model.Track) =>
  track.staves.some((staff) => staff.tuning.length > 0)
    ? StaveProfile.ScoreTab
    : StaveProfile.Score;

/**
 * A small second player for looking at and hearing a score before it joins the library.
 * It reads and plays only: no practice modes, mixer or recording. The scrolling parent of
 * the returned host follows the cursor.
 */
export function useScorePreview(score: model.Score, track: number) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [status, setStatus] = useState<PreviewStatus>({
    rendering: true,
    ready: false,
    playing: false,
    error: null,
  });
  const first = useRef(track);

  useEffect(() => {
    if (!host.current) return;
    const update = (change: Partial<PreviewStatus>) => setStatus((s) => ({ ...s, ...change }));
    update({ rendering: true, ready: false, playing: false, error: null });
    const shown = score.tracks[first.current] ?? score.tracks[0];
    const api = new AlphaTabApi(host.current, {
      core: { fontDirectory: `${import.meta.env.BASE_URL}font/` },
      display: {
        scale: 0.8,
        staveProfile: profileOf(shown),
        padding: [24, 14, 14, 14],
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
        scrollElement: host.current.parentElement!,
        scrollOffsetY: -8,
      },
    });
    apiRef.current = api;
    const sounds = new AbortController();
    let soundsStarted = false;
    let samplesReady = false;
    const loadSounds = () => {
      if (sounds.signal.aborted || soundsStarted) return;
      soundsStarted = true;
      void loadScoreSamples(
        `${import.meta.env.BASE_URL}soundfont/`,
        __RECORDED_BANK_VERSION__,
        { score },
        api.settings,
        sounds.signal,
      )
        .then((bank) => {
          if (sounds.signal.aborted) return;
          samplesReady = true;
          api.loadSoundFont(bank, false);
        })
        .catch((error: unknown) => {
          if (!sounds.signal.aborted)
            update({
              error: error instanceof Error ? error.message : 'Instrument sounds could not load.',
            });
        });
    };
    api.error.on((error) => update({ error: error.message, rendering: false }));
    api.renderFinished.on(() => {
      update({ rendering: false });
      // Paint the notation before starting sample downloads and audio decoding.
      requestAnimationFrame(() => requestAnimationFrame(loadSounds));
    });
    api.postRenderFinished.on(() => {
      if (host.current) hideScoreBranding(host.current);
    });
    api.playerReady.on(() => update({ ready: samplesReady }));
    api.playerStateChanged.on((e) => update({ playing: e.state === 1 }));
    api.metronomeVolume = 0;
    api.countInVolume = 0;
    api.load(score, [shown.index]);
    return () => {
      sounds.abort();
      apiRef.current = null;
      api.destroy();
    };
  }, [score]);

  useEffect(() => {
    const api = apiRef.current;
    const next = score.tracks[track];
    if (!api || !next || api.tracks[0] === next) return;
    if (api.settings.display.staveProfile !== profileOf(next)) {
      api.settings.display.staveProfile = profileOf(next);
      api.updateSettings();
    }
    api.renderTracks([next]);
  }, [score, track]);

  const toggle = useCallback(() => apiRef.current?.playPause(), []);
  const stop = useCallback(() => apiRef.current?.stop(), []);
  return { host, status, toggle, stop };
}
