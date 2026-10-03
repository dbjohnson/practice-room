import { importer, Settings, type model } from '@coderline/alphatab';
import { midiToScore } from './midi/midiScore';
import { isMidi } from './midi/parseMidi';

/** Opens any stored score: MIDI is notated here; alphaTab reads everything else. */
export function loadScore(bytes: Uint8Array): model.Score {
  if (isMidi(bytes)) return midiToScore(bytes);
  return importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
}
