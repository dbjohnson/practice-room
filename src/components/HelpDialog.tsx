import { AudioLines, Check, CircleHelp } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { Modal } from './Modal';

export function HelpDialog() {
  const r = useRoom();
  return (
    <Modal
      open={r.helpOpen}
      title="One room. Three ways to practice."
      onClose={() => r.setHelpOpen(false)}
    >
      <p className="body-copy">
        This is a working design prototype. Switch between Phrase, Trail and Pocket to try different
        ways of learning with the same musical tools.
      </p>
      <div className="help-list">
        <p>
          <Check size={17} />
          <span>
            <strong>Working today</strong>Guitar Pro / MusicXML import, score and TAB, sampled
            playback, loops, a mixer, local library, generated jams, audio-interface setup, a tuner,
            experimental instrument detection and saved take history.
          </span>
        </p>
        <p>
          <AudioLines size={17} />
          <span>
            <strong>Three distinct practice loops</strong>Phrase organizes passages. Trail walks
            through an editable session. Pocket lets you rehearse with the band or strip it back to
            the click.
          </span>
        </p>
        <p>
          <CircleHelp size={17} />
          <span>
            <strong>Still a prototype</strong>Single-note detection and timing are unvalidated.
            Chords and expressive techniques are not graded. No cloud sync, raw recording replay,
            teacher AI or automatic tempo promotion. Trail completion is self-marked.
          </span>
        </p>
      </div>
      <p className="muted-copy">
        Notation and playback: alphaTab (MPL-2.0). Included sampled instruments: SONiVOX SoundFont
        (Apache-2.0). Type: Manrope and Fraunces (OFL). Files and results stay in this browser;
        clearing browser data removes them.
      </p>
      <button className="button button-primary" onClick={() => r.setHelpOpen(false)}>
        Back to the music
      </button>
    </Modal>
  );
}
