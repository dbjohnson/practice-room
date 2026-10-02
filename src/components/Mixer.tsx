import { AudioLines, Drum, Guitar, Piano, Volume2, VolumeX } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function Mixer() {
  const r = useRoom();
  const locked = r.takes.recording || r.exerciseLoop.active || r.exerciseLoop.preparing;
  return (
    <section className="mixer">
      <div className="section-label">
        <AudioLines size={15} />
        YOUR BACKING BAND <span>Sampled sounds</span>
        <button className="text-button" disabled={locked} onClick={() => r.setVolumes({})}>
          Reset levels
        </button>
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
