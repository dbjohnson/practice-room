import { useState } from 'react';
import { Check, Cable, LoaderCircle, RefreshCw, Unplug } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function InterfaceConnection() {
  const r = useRoom();
  const { status, start, stop, selectChannel } = r.input;
  const { devices, authorized, loading, error, discover, cancel } = r.audioDevices;
  const [selected, setSelected] = useState(status.deviceId);
  const ready = status.state === 'ready';
  const connecting = status.state === 'connecting';
  const available = devices.some((device) => device.id === selected);
  const connect = () => {
    r.halt();
    void start(selected);
  };
  return (
    <section className="interface-connection" aria-labelledby="interface-title">
      <div className="setup-section-heading">
        <span className="setup-number">01</span>
        <h2 id="interface-title">Connect your interface</h2>
        <Cable size={19} />
      </div>
      <p className="setup-description">
        Plug your guitar or bass into the instrument / Hi-Z input of your audio interface, then
        connect the interface to your computer.
      </p>
      {!authorized ? (
        <div className="audio-access">
          <p>
            Allow audio access to see your devices. Your browser calls this{' '}
            <strong>“microphone” permission</strong>; it also covers audio interfaces.
          </p>
          <button
            className="button button-primary"
            disabled={loading}
            onClick={() => void discover()}
          >
            {loading ? <LoaderCircle size={16} className="spin" /> : <Cable size={16} />}
            {loading ? 'Waiting for permission…' : 'Find audio inputs'}
          </button>
          {loading && (
            <button className="text-button" onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <>
          <label className="setup-field">
            Audio interface
            <select
              aria-label="Audio interface"
              value={ready ? status.deviceId : available ? selected : ''}
              disabled={connecting || loading}
              onChange={(event) => {
                r.halt();
                stop();
                setSelected(event.target.value);
              }}
            >
              <option value="">Choose your interface…</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <div className="device-refresh">
            <span>
              {devices.length
                ? 'Select the interface your instrument is plugged into.'
                : 'No audio inputs found.'}
            </span>
            <button
              className="text-button"
              disabled={loading || connecting}
              onClick={() => void discover()}
              aria-label="Refresh audio inputs"
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              Refresh
            </button>
          </div>
          {ready && (
            <label className="setup-field channel-field">
              Input channel
              <select
                aria-label="Interface input channel"
                value={status.channel}
                onChange={(event) => {
                  r.halt();
                  selectChannel(Number(event.target.value));
                }}
              >
                {Array.from({ length: status.channelCount }, (_, i) => (
                  <option key={i} value={i}>
                    Input {i + 1}
                    {status.channelCount === 2 ? (i === 0 ? ' · left' : ' · right') : ''}
                  </option>
                ))}
              </select>
              <span>
                Your browser exposes{' '}
                {status.channelCount === 1 ? 'one channel' : `${status.channelCount} channels`}.
                Select the one that responds when you play.
              </span>
            </label>
          )}
          <div className="connection-actions">
            {ready ? (
              <>
                <span className="connection-ready">
                  <Check size={15} />
                  Connected
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
              <>
                <button
                  className="button button-primary"
                  disabled={!available || connecting || loading}
                  onClick={connect}
                >
                  {connecting ? <LoaderCircle size={15} className="spin" /> : <Cable size={15} />}
                  {connecting ? 'Connecting…' : 'Connect interface'}
                </button>
                {connecting && (
                  <button className="text-button" onClick={stop}>
                    Cancel
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
      {(error || status.error) && (
        <div className="notice notice-error" role="alert">
          {status.error || error}
        </div>
      )}
      <details className="connection-help">
        <summary>Can’t find your interface?</summary>
        <p>
          Check its USB connection and your computer’s sound-input settings, then refresh. Some
          drivers expose only the first two inputs to the browser. Choose an instrument input on
          your interface and turn off effects while tuning.
        </p>
      </details>
    </section>
  );
}
