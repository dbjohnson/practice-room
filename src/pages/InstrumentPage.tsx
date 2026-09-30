import {
  ArrowLeft,
  ArrowRight,
  Cable,
  Guitar,
  Headphones,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { InterfaceConnection } from '../components/InterfaceConnection';
import { InputLevelMeter } from '../components/InputLevelMeter';
import { TunerPanel } from '../components/TunerPanel';

export function InstrumentPage() {
  const r = useRoom();
  const ready = r.input.status.state === 'ready';
  return (
    <div className="instrument-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-line" />
            BEFORE THE FIRST NOTE
          </div>
          <h1>Plug in. Settle in. Tune up.</h1>
          <p>A clear signal and a little preparation. Then it’s just you and the music.</p>
        </div>
        <button className="button button-quiet" onClick={() => r.setPage('practice')}>
          <ArrowLeft size={15} />
          Back to practice
        </button>
      </div>
      <div
        className="signal-route"
        aria-label="Instrument to audio interface; listen through headphones"
      >
        <span>
          <Guitar size={20} />
          <strong>Your instrument</strong>
        </span>
        <i />
        <span>
          <Cable size={20} />
          <strong>Audio interface</strong>
        </span>
        <i />
        <span>
          <Headphones size={20} />
          <strong>Headphones</strong>
        </span>
        <div className="route-caption">A clean, direct connection.</div>
      </div>
      <div className="feedback-warning">
        <TriangleAlert size={22} />
        <div>
          <strong>Use headphones to avoid feedback.</strong>
          <p>
            Turn down or mute your speakers before connecting. Sound from speakers can feed back
            through a microphone or instrument pickup. Practice Room never plays your live input
            through its output; use your interface’s direct monitoring if you want to hear yourself.
          </p>
        </div>
      </div>
      <div className="instrument-grid">
        <div className="input-setup-card">
          <InterfaceConnection />
          <InputLevelMeter status={r.input.status} />
        </div>
        <TunerPanel status={r.input.status} />
      </div>
      <div className="setup-footer">
        <p>
          <ShieldCheck size={17} />
          <span>Your input stays on this device. No raw audio is saved or uploaded.</span>
        </p>
        <button className="button button-primary" onClick={() => r.setPage('practice')}>
          {ready ? 'Ready to practice' : 'Practice without input'}
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
