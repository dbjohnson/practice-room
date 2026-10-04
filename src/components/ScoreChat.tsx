import { useState } from 'react';
import { LoaderCircle, Send, X } from 'lucide-react';
import { useRoom } from '../app/RoomContext';
import { generatePiece } from '../app/sourcesClient';
import { useGenerationModel } from '../app/useGenerationModel';
import { validGenerationModel } from '../domain/generation';
import { editHistory, pieceVersions, revisionFamily } from '../domain/revisions';
import { editableScore } from '../music/scoreRevision';
import { GenerationModelPicker } from './GenerationModelPicker';
import { ScoreVersions } from './ScoreVersions';

export function ScoreChat({ onClose }: { onClose: () => void }) {
  const r = useRoom();
  const { developer, model, selectedModel, setModel } = useGenerationModel();
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [pending, setPending] = useState('');
  const versions = pieceVersions(r.library.pieces, r.library.piece);
  const requests = (r.library.editRequests ?? []).filter(
    (request) =>
      request.familyId === revisionFamily(r.library.piece) &&
      !versions.some((piece) => piece.id === request.versionId),
  );
  const disabled =
    r.library.busy ||
    r.takes.recording ||
    writing ||
    requests.some((request) => request.status === 'working');
  const select = (piece: typeof r.library.piece) => {
    r.halt();
    setError(null);
    void r.library.select(piece);
  };
  const submit = async () => {
    if (disabled || prompt.trim().length < 3 || !validGenerationModel(selectedModel)) return;
    const instruction = prompt.trim();
    setError(null);
    try {
      const currentScore = editableScore(r.library.score);
      const track = r.library.score.tracks[r.track];
      const program = track?.playbackInfo.program ?? 24;
      const instrument = program >= 32 && program <= 39 ? 'bass' : 'guitar';
      r.halt();
      setWriting(true);
      setPending(instruction);
      setPrompt('');
      const saved = await r.library.revise(
        r.library.score,
        instruction,
        selectedModel,
        async (requestId) => {
          const result = await generatePiece(
            {
              prompt: instruction,
              instrument,
              level: 'intermediate',
              currentScore,
              history: editHistory(r.library.pieces, r.library.piece),
              ...(developer ? { model: selectedModel } : {}),
            },
            { id: requestId, source: r.library.piece },
          );
          return result.alphaTex;
        },
      );
      if (!saved)
        throw new Error(
          'The edit was interrupted before it could be saved. Your request is kept below.',
        );
    } catch (reason) {
      setPrompt(instruction);
      setError(reason instanceof Error ? reason.message : 'Could not save that edit. Try again.');
    } finally {
      setWriting(false);
      setPending('');
    }
  };
  return (
    <aside className="score-chat" aria-label="Edit piece with AI">
      <div className="score-chat-heading">
        <div>
          <h2>Edit this piece</h2>
          <p className="muted-copy">Every edit is saved as a new version.</p>
        </div>
        <button className="icon-button" aria-label="Close score chat" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <ScoreVersions
        versions={versions}
        current={r.library.piece}
        disabled={disabled}
        onSelect={select}
      />
      {requests.map((request) => (
        <div className="score-chat-turn" key={request.id}>
          <p className="score-chat-request">{request.prompt}</p>
          <p className="muted-copy">
            {request.status === 'working'
              ? 'Generating a new version…'
              : request.status === 'saved'
                ? 'New version saved in your library.'
                : (request.error ?? 'This request did not finish.')}
          </p>
          {request.status === 'saved' && (
            <button
              className="button button-quiet"
              disabled={r.library.busy || r.takes.recording}
              onClick={() => {
                const version = r.library.pieces.find((piece) => piece.id === request.versionId);
                if (version) select(version);
              }}
            >
              Open saved version
            </button>
          )}
          {request.status === 'failed' && (
            <button
              className="button button-quiet"
              disabled={disabled}
              onClick={() => setPrompt(request.prompt)}
            >
              Use this request
            </button>
          )}
        </div>
      ))}
      {writing && !requests.length && (
        <div className="score-chat-pending" role="status">
          <p>{pending}</p>
          <LoaderCircle className="spin" size={16} /> Writing a new version…
        </div>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="score-chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {developer && (
          <details>
            <summary>Model</summary>
            <GenerationModelPicker model={model} onChange={setModel} disabled={disabled} />
          </details>
        )}
        <textarea
          aria-label="Edit instructions"
          value={prompt}
          maxLength={600}
          rows={3}
          disabled={disabled}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229
            )
              return;
            event.preventDefault();
            if (!event.repeat) void submit();
          }}
          placeholder="Add a walking bass part and soft brush-style drums…"
        />
        <button
          className="button button-dark"
          disabled={disabled || prompt.trim().length < 3 || !validGenerationModel(selectedModel)}
        >
          <Send size={16} /> Save a new version
        </button>
        <small className="muted-copy">Enter to send · Shift+Enter for a new line.</small>
        <small className="muted-copy">
          The current score and your request go to OpenRouter. Review the result before practising.
        </small>
      </form>
    </aside>
  );
}
