import { useId } from 'react';
import { AudioLines, TriangleAlert } from 'lucide-react';
import type { InputStatus } from '../domain/types';
import { levelGuidance } from '../audio/inputLevels';

export function InputLevelMeter({ status }: { status: InputStatus }) {
  const titleId = useId();
  const ready = status.state === 'ready';
  const guidance = levelGuidance(status.peakDb, status.clipped);
  return (
    <section
      className={`input-level-panel level-${ready ? guidance.kind : 'off'}`}
      aria-labelledby={titleId}
    >
      <div className="setup-section-heading">
        <span className="setup-number">02</span>
        <h2 id={titleId}>Find a healthy level</h2>
        <AudioLines size={19} />
      </div>
      <div className="level-readout">
        <span>INPUT PEAK</span>
        <strong>
          {ready && status.peakDb > -60 ? status.peakDb.toFixed(1).replace('-', '−') : '−∞'}{' '}
          <small>dBFS</small>
        </strong>
        <span className={`clip-indicator ${status.clipped ? 'active' : ''}`}>CLIP</span>
      </div>
      <div
        className="input-segments"
        role="meter"
        aria-label="Instrument input level"
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={ready ? Math.round(status.peakDb) : -60}
        aria-valuetext={
          ready
            ? `${Math.round(status.peakDb)} dBFS${status.clipped ? ', clipping' : ''}`
            : 'Input disconnected'
        }
      >
        {Array.from({ length: 30 }, (_, index) => {
          const threshold = -60 + (index + 1) * 2;
          return (
            <i
              key={index}
              className={`${threshold > -6 ? 'red' : threshold > -18 ? 'amber' : 'green'} ${ready && status.peakDb >= threshold ? 'lit' : ''}`}
            />
          );
        })}
      </div>
      <div className="level-scale">
        <span>−60</span>
        <span>−36</span>
        <span>−18</span>
        <span>−6</span>
        <span>0</span>
      </div>
      <div className="level-advice" aria-live="polite">
        <strong>
          {status.clipped && <TriangleAlert size={15} />}
          {ready ? guidance.title : 'Your signal will appear here'}
        </strong>
        <p>
          {ready
            ? guidance.detail
            : 'Connect your interface, then play a few notes at your normal volume.'}
        </p>
      </div>
      <p className="setup-hint">
        Adjust gain on your interface. This meter shows the selected input channel.
      </p>
    </section>
  );
}
