import { useEffect, useRef, type RefObject } from 'react';
import type { AlphaTabApi } from '@coderline/alphatab';
import { applySwing } from '../music/swing';
import { configurePlayer } from './configurePlayer';
import type { PlayerOptions } from './useScorePlayer';

/** Rebuild MIDI and its timing cache together, coalescing slider drags. */
export function useSwingPlayback(
  apiRef: RefObject<AlphaTabApi | null>,
  latest: RefObject<PlayerOptions>,
  score: PlayerOptions['score'],
  swing: number | null,
) {
  const resume = useRef<{ score: PlayerOptions['score']; tick: number; playing: boolean } | null>(
    null,
  );
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    if (api.score !== score) {
      resume.current = null;
      applySwing(score, swing);
      return;
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      resume.current ??= { score, tick: api.tickPosition, playing: api.playerState === 1 };
      api.pause();
      latest.current.onStatus({ ready: false });
      applySwing(score, swing);
      let awaitingLoad = false;
      unsubscribe = api.playerReady.on(() => {
        if (!awaitingLoad) return; // Ignore the immediate subscription callback for the old rhythm.
        queueMicrotask(() => {
          if (!active || apiRef.current !== api || latest.current.score !== score) return;
          const position = resume.current;
          resume.current = null;
          configurePlayer(api, latest.current, true);
          if (position?.score === score) {
            api.tickPosition = position.tick;
            if (position.playing) {
              const countIn = api.countInVolume;
              api.countInVolume = 0;
              api.play();
              api.countInVolume = countIn;
            }
          }
          latest.current.onStatus({ ready: true });
          unsubscribe?.();
        });
      });
      awaitingLoad = true;
      api.loadMidiForScore();
      api.render();
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      unsubscribe?.();
    };
  }, [apiRef, latest, score, swing]);
}
