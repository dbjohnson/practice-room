import { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { CALIBRATION_BPM, calibrationPattern } from '../audio/latencyCalibration';
import type { CalibrationResult } from '../audio/useInputCalibration';

export function LatencyCalibration() {
  const r = useRoom();
  const [phase, setPhase] = useState<'idle' | 'running' | 'analysing'>('idle');
  const [note, setNote] = useState(-4);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setPhase('idle');
  };
  useEffect(() => {
    setResult(null);
    setPhase('idle');
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [r.input.calibrationKey]);
  const start = async () => {
    r.halt();
    const run = new AbortController();
    controller.current = run;
    setError('');
    setResult(null);
    setNote(-4);
    setPhase('running');
    try {
      const measured = await r.input.calibrate(run.signal, (index) => {
        setNote(index);
        if (index >= 32) setPhase('analysing');
      });
      if (!run.signal.aborted) setResult(measured);
    } catch (failure) {
      if (!run.signal.aborted)
        setError(
          failure instanceof Error ? failure.message : 'Calibration did not finish. Try again.',
        );
    } finally {
      if (controller.current === run) {
        controller.current = null;
        setPhase('idle');
      }
    }
  };
  const applied = r.input.calibration;
  return (
    <section className="latency-calibration" aria-label="Input timing calibration">
      <h2>
        <Timer size={18} /> Timing offset calibration
      </h2>
      <p>
        After a four-beat count-in, play one short, muted note on each click: four bars of eighth
        notes at {CALIBRATION_BPM} BPM. Use headphones and start on the first note of bar 1.
      </p>
      <p className="muted-copy">
        This measures a signed timing offset, including your playing and browser recording timing,
        rather than hardware latency alone. Negative means attacks were recorded early. Your saved
        correction is never applied during calibration. To measure the hardware alone, run a cable
        from your interface’s output to this input and let the clicks play through it. Until you
        calibrate, takes use the delay your browser reports.
      </p>
      <div className="calibration-pattern" aria-label="Four bars, eight notes per bar">
        {Array.from({ length: 4 }, (_, bar) => (
          <div key={bar}>
            <span>{bar + 1}</span>
            {Array.from({ length: 8 }, (_, beat) => (
              <i
                key={beat}
                className={
                  phase !== 'idle' && note === bar * 8 + beat
                    ? 'current'
                    : phase !== 'idle' && note > bar * 8 + beat
                      ? 'played'
                      : ''
                }
              >
                {beat % 2 ? '&' : beat / 2 + 1}
              </i>
            ))}
          </div>
        ))}
      </div>
      {phase !== 'idle' && (
        <p role="status">
          {phase === 'analysing'
            ? 'Matching your transients…'
            : note < 0
              ? `Count in · ${Math.max(1, note + 5)} of 4`
              : `Play · bar ${Math.floor(note / 8) + 1} of 4`}
        </p>
      )}
      {error && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}
      {result && (
        <div className="calibration-result" role="status">
          <strong>
            {result.reliable
              ? `Estimated offset: ${result.offsetMs > 0 ? '+' : ''}${result.offsetMs} ms`
              : 'Try another pass'}
          </strong>
          {result.reliable && (
            <p>
              Input attacks read {Math.abs(result.offsetMs)} ms{' '}
              {result.offsetMs < 0 ? 'early' : 'late'}. Correction shifts them{' '}
              {Math.abs(result.offsetMs)} ms {result.offsetMs < 0 ? 'later' : 'earlier'}.
            </p>
          )}
          <p>
            {result.matched}/32 attacks matched · {result.jitterMs} ms variation. {result.reason}
            {result.reliable && result.matched >= 30 && result.jitterMs <= 3
              ? ' This is steadier than playing: it looks like a loopback cable, so it measures the hardware alone.'
              : ''}
          </p>
          <svg
            viewBox="0 0 640 48"
            role="img"
            aria-label="Click positions above and aligned input attacks below"
          >
            {calibrationPattern.map((time, i) => (
              <path key={i} d={`M${time * 57},5v14`} className="calibration-guide" />
            ))}
            {result.transients.map((time, i) => (
              <path
                key={i}
                d={`M${(time - result.offsetMs / 1000) * 57},28v14`}
                className="calibration-attack"
              />
            ))}
          </svg>
          {result.reliable && (
            <button
              className="button button-primary"
              onClick={() => {
                r.input.saveCalibration(result);
                setResult(null);
              }}
            >
              Apply correction
            </button>
          )}
        </div>
      )}
      {applied && (
        <p className="calibration-applied">
          Correction: {applied.offsetMs < 0 ? '+' : applied.offsetMs > 0 ? '−' : ''}
          {Math.abs(applied.offsetMs)} ms ({applied.offsetMs < 0 ? 'later' : 'earlier'}) for this
          interface and channel.{' '}
          <button
            className="text-button"
            disabled={phase !== 'idle'}
            onClick={() => r.input.saveCalibration(null)}
          >
            Reset
          </button>
        </p>
      )}
      <button
        className="button button-quiet"
        disabled={r.input.status.state !== 'ready'}
        onClick={phase === 'idle' ? () => void start() : cancel}
      >
        {phase === 'idle'
          ? applied
            ? 'Recalibrate input timing'
            : 'Calibrate input timing'
          : 'Cancel calibration'}
      </button>
    </section>
  );
}
