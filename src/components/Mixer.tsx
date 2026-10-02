import { AudioLines, Cable, Drum, Guitar, Piano, Volume2, VolumeX } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function Mixer() {
  const r = useRoom();
  const out = r.midiOut;
  const locked = r.takes.recording || r.exerciseLoop.active || r.exerciseLoop.preparing;
  return (
    <section className="mixer">
      <div className="section-label">
        <AudioLines size={15} />
        YOUR BACKING BAND <span>Sampled sounds</span>
        <button className="text-button" disabled={locked} onClick={() => r.setVolumes({})}>
          Reset levels
        </button>
        {!out.authorized && (
          <button
            className="text-button"
            title="Send a part to an instrument plugin through a MIDI output"
            onClick={() => void out.discover()}
          >
            <Cable size={13} />
            Use your own instruments
          </button>
        )}
      </div>
      <div className="mixer-tracks">
        {r.library.score.tracks.map((track) => {
          const muted =
            r.muted.includes(track.index) || (r.mode !== 'listen' && r.track === track.index);
          const Icon = track.isPercussion
            ? Drum
            : track.name.toLowerCase().includes('key') || track.name.toLowerCase().includes('piano')
              ? Piano
              : Guitar;
          return (
            <div className={`mixer-track ${muted ? 'is-muted' : ''}`} key={track.index}>
              <div className="track-symbol">
                <Icon size={18} strokeWidth={1.5} />
              </div>
              <div className="track-controls">
                <div>
                  <span>{track.name}</span>
                  {r.track === track.index && <small>YOUR PART</small>}
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  aria-label={`${track.name} volume`}
                  value={r.volumes[track.index] ?? 80}
                  disabled={locked}
                  onChange={(e) =>
                    r.setVolumes({ ...r.volumes, [track.index]: Number(e.target.value) })
                  }
                />
                {out.authorized && (
                  <div className="track-route">
                    <select
                      aria-label={`${track.name} sound`}
                      value={out.routes[track.name]?.outputId ?? ''}
                      disabled={locked}
                      onChange={(e) => {
                        r.halt();
                        out.setRoute(
                          track.name,
                          e.target.value
                            ? {
                                outputId: e.target.value,
                                channel:
                                  out.routes[track.name]?.channel ??
                                  (track.isPercussion ? 10 : Math.min(16, track.index + 1)),
                              }
                            : null,
                        );
                      }}
                    >
                      <option value="">Built-in sound</option>
                      {out.outputs.map((output) => (
                        <option key={output.id} value={output.id}>
                          → {output.label}
                        </option>
                      ))}
                      {out.routes[track.name] &&
                        !out.outputs.some((o) => o.id === out.routes[track.name].outputId) && (
                          <option value={out.routes[track.name].outputId}>
                            Output unavailable · built-in sound
                          </option>
                        )}
                    </select>
                    {out.routes[track.name] && (
                      <label>
                        ch
                        <input
                          type="number"
                          min={1}
                          max={16}
                          aria-label={`${track.name} MIDI channel`}
                          value={out.routes[track.name].channel}
                          disabled={locked}
                          onChange={(e) => {
                            const channel = Math.round(Number(e.target.value));
                            if (channel >= 1 && channel <= 16)
                              out.setRoute(track.name, { ...out.routes[track.name], channel });
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
              <button
                className="icon-button"
                aria-label={`${muted ? 'Unmute' : 'Mute'} ${track.name}`}
                aria-pressed={muted}
                disabled={locked || (r.mode !== 'listen' && r.track === track.index)}
                onClick={() =>
                  r.setMuted(
                    r.muted.includes(track.index)
                      ? r.muted.filter((t) => t !== track.index)
                      : [...r.muted, track.index],
                  )
                }
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
            </div>
          );
        })}
      </div>
      {(r.exerciseLoop.active || r.exerciseLoop.preparing) && (
        <small>Stop the loop to adjust levels.</small>
      )}
    </section>
  );
}
