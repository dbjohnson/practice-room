import { importer, Settings, type model } from '@coderline/alphatab';
import { midiToScore } from './midi/midiScore';
import { isMidi } from './midi/parseMidi';

/**
 * Some scores stack several tempo marks on one beat, often a printed one over a hidden
 * playback one. Playback obeys the last, while alphaTab reports the first as the score's
 * tempo, so the shadowed marks are removed to keep the displayed tempo and count-in honest.
 */
function dropShadowedTempos(score: model.Score) {
  for (const bar of score.masterBars)
    bar.tempoAutomations = bar.tempoAutomations.filter(
      (mark, index, all) =>
        !all.slice(index + 1).some((later) => later.ratioPosition === mark.ratioPosition),
    );
  return score;
}

/** Opens any stored score: MIDI is notated here; alphaTab reads everything else. */
export function loadScore(bytes: Uint8Array): model.Score {
  if (isMidi(bytes)) return midiToScore(bytes);
  return dropShadowedTempos(importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings()));
}
