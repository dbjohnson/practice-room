import { useEffect, useState } from 'react';
import { Check, KeyboardMusic, Unplug } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { useStore } from '../audio/store';
import { noteName } from '../music/jam';
import { usePersistentState } from '../storage/usePersistentState';

export function MidiConnection() {
  const r = useRoom();
  const { status, devices, authorized, discover, start, stop } = r.midi;
  const lastNote = useStore(r.midi.lastNote);
  const [remembered, setRemembered] = usePersistentState(
    'midiInput',
    '',
    (v) => typeof v === 'string',
  );
  const [selected, setSelected] = useState(status.deviceId || remembered);
  const ready = status.state === 'ready';
  const available = devices.some((device) => device.id === selected);
  useEffect(() => {
    if (status.state === 'ready') setRemembered(status.deviceId);
    // Only a completed connection is worth remembering.
  }, [status.state, status.deviceId]);
  return (
    <section className="midi-panel" aria-labelledby="midi-title">
      <div className="setup-section-heading">
        <span className="setup-number">or</span>
        <h2 id="midi-title">Play a MIDI instrument</h2>
        <KeyboardMusic size={19} />
      </div>
      <p className="setup-description">
        A keyboard, MIDI guitar or other controller reports each note exactly, chords included, so
        Check take needs no microphone, level or tuning. It replaces the audio interface while
        connected.
      </p>
      {!authorized ? (
        <div className="connection-actions">
          <button className="button button-quiet" onClick={() => void discover()}>
            <KeyboardMusic size={15} />
            Find MIDI instruments
          </button>
        </div>
      ) : (
        <>
          <label className="setup-field">
            MIDI instrument
            <select
              aria-label="MIDI instrument"
              value={available ? selected : ''}
              disabled={status.state === 'connecting'}
              onChange={(event) => {
                r.halt();
                stop();
                setSelected(event.target.value);
              }}
            >
              <option value="">
                {devices.length ? 'Choose your instrument…' : 'No MIDI instruments found'}
              </option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <div className="connection-actions">
            {ready ? (
              <>
                <span className="connection-ready">
                  <Check size={15} />
                  {lastNote === null ? 'Connected · play a note' : `Heard ${noteName(lastNote)}`}
                </span>
                <button
                  className="button button-quiet"
                  onClick={() => {
                    r.halt();
                    stop();
                  }}
                >
                  <Unplug size={15} />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                className="button button-primary"
                disabled={!available || status.state === 'connecting'}
                onClick={() => {
                  r.halt();
                  r.input.stop();
                  void start(selected);
                }}
              >
                <KeyboardMusic size={15} />
                Connect MIDI instrument
              </button>
            )}
          </div>
        </>
      )}
      {status.error && (
        <div className="notice notice-error" role="alert">
          {status.error}
        </div>
      )}
      <p className="setup-hint">
        Drum pads and percussion parts are not graded yet. MIDI takes are not recorded as audio.
        Timing uses the output delay your browser reports; the click calibration above applies only
        to an audio interface.
      </p>
    </section>
  );
}
