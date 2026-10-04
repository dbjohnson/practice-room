import { AudioLines, Check, CircleHelp } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { Credits } from './Credits';
import { Modal } from './Modal';

export function HelpDialog() {
  const r = useRoom();
  return (
    <Modal open={r.helpOpen} title="Practice Room" onClose={() => r.setHelpOpen(false)}>
      <p className="body-copy">
        Open your music, choose a passage and play. Tuner, Mixer, Effects, Passages and Feedback are
        available as separate panels below the score when you need them.
      </p>
      <div className="help-list">
        <p>
          <Check size={17} />
          <span>
            <strong>Working today</strong>Guitar Pro / MusicXML / MIDI import, catalogue search,
            score and TAB, sampled playback, loops, a mixer, local library, generated jams,
            audio-interface setup, a tuner, experimental instrument detection and saved take
            history.
          </span>
        </p>
        <p>
          <AudioLines size={17} />
          <span>
            <strong>Playback and recording</strong>Press Play to hear the score. With an instrument
            connected, Play also records your take and shows its waveform. Adjust each track’s
            volume, mute or solo in the mixer. Replay includes the backing track by default. Space
            starts and pauses playback.
          </span>
        </p>
        <p>
          <CircleHelp size={17} />
          <span>
            <strong>Still a prototype</strong>Single-note detection and timing are unvalidated.
            Chords and expressive techniques are not graded. No cloud sync, teacher AI or automatic
            tempo promotion.
          </span>
        </p>
      </div>
      <p className="muted-copy">
        Notation and playback: alphaTab (MPL-2.0). Recorded guitar, bass, piano and drums with
        SONiVOX fallback voices. Type: Manrope and Fraunces (OFL). Files, recordings and results
        stay in this browser; clearing browser data removes them.
      </p>
      <Credits />
      <button className="button button-primary" onClick={() => r.setHelpOpen(false)}>
        Back to the music
      </button>
    </Modal>
  );
}
