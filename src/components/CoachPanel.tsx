import { FlaskConical } from 'lucide-react';
import { useRoom } from '../app/RoomContext';

export function CoachPanel() {
  const r = useRoom();
  return (
    <section className="feedback-panel" aria-label="Practice feedback">
      <h2>Check your take</h2>
      <p>
        Connect your instrument, select Record take, then record the passage. Feedback compares
        clean single notes and timing with the written part.
      </p>
      <div className="feedback-actions">
        <button
          className="button button-primary"
          disabled={r.takes.recording}
          onClick={() => {
            r.setMode('assess');
            if (r.inputConnected)
              r.notify('Record take is selected. Press record when you’re ready.');
          }}
        >
          Set up a take
        </button>
        <button
          className="text-button"
          disabled={r.takes.recording}
          onClick={() => {
            r.halt();
            r.takes.showExample();
          }}
        >
          <FlaskConical size={15} />
          Explore example feedback
        </button>
      </div>
      <p className="muted-copy">
        Assessment is experimental. Example feedback does not change your saved progress.
      </p>
    </section>
  );
}
