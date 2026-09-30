import { ArrowRight, AudioLines, FlaskConical, Lightbulb, Sparkles } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function CoachPanel() {
  const r = useRoom();
  const copy =
    r.concept === 'phrase'
      ? [
          'One phrase. A little better.',
          'Listen once. Slow it down. Find the notes that need your attention. Then let the music connect again.',
        ]
      : r.concept === 'trail'
        ? [
            'Small steps, real music.',
            'Follow today’s three activities. Every exercise comes back to this piece, so the work goes somewhere.',
          ]
        : [
            'Leave room for your part.',
            'Let the band carry the harmony. Mute your part, find the pulse, and settle into the groove.',
          ];
  return (
    <aside className="coach-panel">
      <div className="coach-eyebrow">
        <Sparkles size={16} />
        YOUR PRACTICE COMPANION
      </div>
      <div className="coach-orb">
        <AudioLines size={34} strokeWidth={1.1} />
      </div>
      <h3>{copy[0]}</h3>
      <p>{copy[1]}</p>
      <div className="coach-tip">
        <Lightbulb size={17} />
        <span>
          {r.concept === 'pocket'
            ? 'In a free jam, there’s no “wrong solo.” Check take compares only the written part.'
            : 'Two comfortable takes are a better reason to speed up than one lucky pass.'}
        </span>
      </div>
      <button
        className="button button-primary"
        onClick={() => {
          r.setMode('assess');
          if (r.input.status.state === 'ready')
            r.notify('Check take is selected. Press record when you’re ready.');
        }}
      >
        Try a recorded take <ArrowRight size={16} />
      </button>
      <button
        className="example-link"
        onClick={() => {
          r.halt();
          r.takes.showExample();
        }}
      >
        <FlaskConical size={14} />
        Explore example feedback
      </button>
      <p className="coach-footnote">
        Example feedback is illustrative.
        <br />
        Your progress starts with your own takes.
      </p>
    </aside>
  );
}
