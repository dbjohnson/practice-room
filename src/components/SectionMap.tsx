import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  Flag,
  Headphones,
  Route,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { clampTempo } from '../time/timeline';
import { useRoom } from '../app/RoomContext';

export function SectionMap() {
  const r = useRoom();
  const bars = r.library.piece.bars;
  const chunks = Array.from({ length: Math.min(8, Math.ceil(bars / 4)) }, (_, i) => ({
    start: i * Math.ceil(bars / Math.min(8, Math.ceil(bars / 4))) + 1,
    end: Math.min(bars, (i + 1) * Math.ceil(bars / Math.min(8, Math.ceil(bars / 4)))),
  })).filter((x) => x.start <= bars);
  if (r.concept === 'trail') {
    const missions = [
      {
        title: 'Hear the shape',
        time: '2 min',
        body: 'Listen, follow the notes, find your starting point.',
        icon: Headphones,
        start: 1,
        end: 2,
        tempo: Math.round(r.library.piece.bpm * 0.75),
      },
      {
        title: 'Work the transition',
        time: '5 min',
        body: 'A shorter loop. A little more breathing room.',
        icon: Route,
        start: Math.min(3, bars),
        end: Math.min(4, bars),
        tempo: Math.round(r.library.piece.bpm * 0.7),
      },
      {
        title: 'Bring it together',
        time: '3 min',
        body: 'Reconnect the phrase and hear what changed.',
        icon: Flag,
        start: 1,
        end: Math.min(4, bars),
        tempo: Math.round(r.library.piece.bpm * 0.85),
      },
    ];
    return (
      <section className="context-panel mission-panel">
        <div className="panel-heading">
          <span>TODAY’S PATH</span>
          <span>10 MIN</span>
        </div>
        {missions.map((mission, i) => (
          <button
            className={`mission-step ${r.mission === i ? 'active' : ''}`}
            key={mission.title}
            disabled={r.takes.recording}
            onClick={() => {
              r.setMission(i);
              r.setRange({ start: mission.start, end: mission.end });
              r.setTempo(clampTempo(mission.tempo));
              r.setMode(i === 0 ? 'listen' : 'along');
              r.setClick(i === 1);
            }}
          >
            <span className="mission-number">
              {r.completedMissions.includes(i) ? <Check size={15} /> : `0${i + 1}`}
            </span>
            <div>
              <strong>{mission.title}</strong>
              <small>
                {mission.time} ·{' '}
                {r.completedMissions.includes(i)
                  ? 'Self-marked practiced'
                  : 'Your music, one small step'}
              </small>
              {r.mission === i && <p>{mission.body}</p>}
            </div>
          </button>
        ))}
        <div className="mission-footer">
          <span>{r.completedMissions.length} of 3 activities practiced</span>
          <div className="thin-progress">
            <i style={{ width: `${(r.completedMissions.length / 3) * 100}%` }} />
          </div>
          <button
            className="text-button"
            onClick={() => {
              r.setCompletedMissions([...new Set([...r.completedMissions, r.mission])]);
              r.notify('Marked as practiced. Record a take when you want performance evidence.');
            }}
          >
            Mark this activity practiced <Check size={14} />
          </button>
        </div>
      </section>
    );
  }
  if (r.concept === 'pocket')
    return (
      <section className="context-panel">
        <div className="panel-heading">
          <span>REHEARSAL SET</span>
          <Sparkles size={15} />
        </div>
        {[
          { title: 'Learn the part', desc: 'The written line, at your pace', icon: Headphones },
          { title: 'Strip it back', desc: 'Just your instrument and a click', icon: Circle },
          { title: 'Full band', desc: 'Bring the other players back', icon: Volume2 },
        ].map(({ title, desc, icon: Icon }) => (
          <button
            className={`set-item ${r.challenge === title ? 'active' : ''}`}
            key={title}
            disabled={r.takes.recording}
            onClick={() => {
              r.halt();
              r.setChallenge(title);
              r.setMode('along');
              r.setClick(title === 'Strip it back');
              r.setMuted(
                title === 'Strip it back' ? r.library.score.tracks.map((t) => t.index) : [],
              );
            }}
          >
            <Icon size={18} />
            <span>
              <strong>{title}</strong>
              <small>{desc}</small>
            </span>
            <ChevronRight size={15} />
          </button>
        ))}
        <button className="panel-link" onClick={() => r.setPage('jam')}>
          Build another backing track <ArrowUpRight size={15} />
        </button>
      </section>
    );
  return (
    <section className="context-panel">
      <div className="panel-heading">
        <span>PIECE MAP</span>
        <span>{bars} MEASURES</span>
      </div>
      {chunks.map((section, i) => (
        <button
          key={section.start}
          className={`phrase-section ${r.range.start === section.start && r.range.end === section.end ? 'active' : ''}`}
          disabled={r.takes.recording}
          onClick={() => r.setRange(section)}
        >
          <span className="section-index">{String(i + 1).padStart(2, '0')}</span>
          <span>
            <strong>
              {i === 0 ? 'Find the melody' : i === 1 ? 'The next turn' : `Phrase ${i + 1}`}
            </strong>
            <small>
              Measures {section.start}–{section.end}
            </small>
          </span>
          <ChevronRight size={15} />
        </button>
      ))}
      <button
        className="panel-link"
        disabled={r.takes.recording}
        onClick={() => r.setRange({ start: 1, end: bars })}
      >
        Play the whole piece <ArrowUpRight size={15} />
      </button>
    </section>
  );
}
