import { LoaderCircle, Timer } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function LatencyPanel() {
  const r = useRoom();
  const { known, measured, measuring, measure, forget } = r.latency;
  const ready = r.input.status.state === 'ready';
  const midi = r.midi.status.state === 'ready';
  const current = known();
  return (
    <section className="latency-panel" aria-labelledby="latency-title">
      <div>
        <h2 id="latency-title">
          <Timer size={18} /> Measure your latency
        </h2>
      </div>
      <p className="setup-description">
        Sound takes time to reach you and come back. Recording removes that delay before judging
        your timing, so it needs to know how long it is.
      </p>
      <div className="latency-readout" aria-live="polite">
        <strong>
          {current ? `${current.ms} ms` : 'Unknown'}
          <small>
            {measured
              ? `measured ${new Date(measured.measuredAt).toLocaleDateString()}`
              : current
                ? midi
                  ? 'output delay reported by your browser'
                  : 'reported by your browser'
                : 'guessed from each take'}
          </small>
        </strong>
        <p>
          {measured
            ? 'Measured on this interface. Measure again if you change headphones, speakers or buffer size.'
            : current
              ? 'An estimate from your browser. It is often close for a wired interface and wrong for Bluetooth.'
              : 'Without a figure, each take is lined up to your own average, which hides steady rushing or dragging.'}
        </p>
      </div>
      <div className="connection-actions">
        <button
          className="button button-quiet"
          disabled={!ready || measuring || r.takes.recording}
          onClick={() => {
            r.halt();
            void measure();
          }}
        >
          {measuring ? <LoaderCircle size={15} className="spin" /> : <Timer size={15} />}
          {measuring
            ? 'Listening for clicks…'
            : measured
              ? 'Measure again'
              : 'Measure with a cable'}
        </button>
        {measured && !measuring && (
          <button className="text-button" onClick={forget}>
            Forget measurement
          </button>
        )}
      </div>
      <p className="setup-hint">
        Run a cable from your interface’s output (or headphone out) to the selected input, then
        measure. Twelve clicks play; turn your headphones down first. Reconnect your instrument
        afterwards. Nothing is played by hand, so this is the hardware alone.
      </p>
    </section>
  );
}
