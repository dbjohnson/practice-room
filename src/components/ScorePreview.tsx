import { useEffect, useState } from 'react';
import { LoaderCircle, Pause, Play, SkipBack } from 'lucide-react';
import type { model } from '@coderline/alphatab';
import { useScorePreview } from '../audio/useScorePreview';
import { importBytes } from '../music/importScore';

function PreviewPlayer({ score }: { score: model.Score }) {
  const [track, setTrack] = useState(0);
  const { host, status, toggle, stop } = useScorePreview(score, track);
  return (
    <>
      <div className="find-preview-bar">
        <button
          className="button button-dark"
          disabled={!status.ready}
          aria-label={status.playing ? 'Pause preview' : 'Play preview'}
          onClick={toggle}
        >
          {!status.ready && !status.error ? (
            <LoaderCircle size={14} className="spin" />
          ) : status.playing ? (
            <Pause size={14} />
          ) : (
            <Play size={14} />
          )}{' '}
          {!status.ready && !status.error ? 'Loading sounds…' : status.playing ? 'Pause' : 'Play'}
        </button>
        <button
          className="icon-button"
          disabled={!status.ready}
          aria-label="Back to the start"
          onClick={stop}
        >
          <SkipBack size={15} />
        </button>
        {score.tracks.length > 1 && (
          <select
            aria-label="Part shown"
            value={track}
            onChange={(e) => setTrack(Number(e.target.value))}
          >
            {score.tracks.map((part) => (
              <option key={part.index} value={part.index}>
                {part.name || `Part ${part.index + 1}`}
              </option>
            ))}
          </select>
        )}
        <span>
          {Math.round(score.tempo)} bpm
          {score.tracks.length > 1 && ` · ${score.tracks.length} parts, all playing`}
        </span>
      </div>
      {status.error && (
        <div className="notice notice-error" role="alert">
          {status.error}
        </div>
      )}
      <div className="find-preview-score" aria-label="Preview notation">
        {status.rendering && (
          <div className="score-loading">
            <LoaderCircle size={18} className="spin" />
            Setting out the music…
          </div>
        )}
        <div ref={host} className="notation-host" />
      </div>
    </>
  );
}

/** Shows and plays a catalogue result as it would open, before it is added to the library. */
export function ScorePreview({
  filename,
  load,
}: {
  filename: string;
  load: () => Promise<ArrayBuffer>;
}) {
  const [result, setResult] = useState<{ score?: model.Score; error?: string } | null>(null);
  useEffect(() => {
    let current = true;
    load()
      .then((bytes) => importBytes(filename, bytes))
      .then(
        ({ score }) => current && setResult({ score }),
        (error: unknown) =>
          current &&
          setResult({ error: error instanceof Error ? error.message : 'Could not preview this.' }),
      );
    return () => {
      current = false;
    };
    // The parent keys this component by result, so one load per mount is the contract.
  }, []);
  return (
    <div className="find-preview">
      {!result && (
        <p className="muted-copy">
          <LoaderCircle size={14} className="spin" /> Fetching the score…
        </p>
      )}
      {result?.error && (
        <div className="notice notice-error" role="alert">
          {result.error}
        </div>
      )}
      {result?.score && <PreviewPlayer score={result.score} />}
    </div>
  );
}
