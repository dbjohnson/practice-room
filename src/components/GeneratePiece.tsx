import { useState } from 'react';
import { LoaderCircle, WandSparkles } from 'lucide-react';
import { generatePiece, type GenerateInput } from '../app/sourcesClient';

import { validGenerationModel } from '../domain/generation';
import { useGenerationModel } from '../app/useGenerationModel';
import { GenerationModelPicker } from './GenerationModelPicker';

const levels: GenerateInput['level'][] = ['beginner', 'intermediate', 'advanced'];
const ideas = [
  'A 12-bar blues shuffle riff in A with a turnaround',
  'Alternate-picking sixteenths across three strings in E minor',
  'A walking bass line over ii–V–I in B flat',
];

export function GeneratePiece({
  ready,
  busy,
  onAdd,
}: {
  ready: boolean;
  busy: boolean;
  onAdd: (prompt: string, bytes: () => Promise<ArrayBuffer>, jobId: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [instrument, setInstrument] = useState<GenerateInput['instrument']>('guitar');
  const [level, setLevel] = useState<GenerateInput['level']>('intermediate');
  const { developer, model, selectedModel, setModel } = useGenerationModel();
  const [instrumentation, setInstrumentation] = useState('');
  const [writing, setWriting] = useState(false);
  if (!ready)
    return (
      <p className="body-copy">
        AI generation is not set up on this server. Add OPEN_ROUTER_API_KEY to the server’s
        environment to turn it on; see docs/sources.md.
      </p>
    );
  return (
    <form
      className="generate-form"
      onSubmit={(e) => {
        e.preventDefault();
        setWriting(true);
        const jobId = crypto.randomUUID();
        onAdd(
          prompt.trim(),
          async () => {
            try {
              const { alphaTex } = await generatePiece(
                {
                  prompt: prompt.trim(),
                  instrument,
                  level,
                  instrumentation: instrumentation.trim(),
                  ...(developer ? { model: selectedModel } : {}),
                },
                { id: jobId },
              );
              return new TextEncoder().encode(alphaTex).buffer as ArrayBuffer;
            } finally {
              setWriting(false);
            }
          },
          jobId,
        );
      }}
    >
      <div className="composer-label">
        <WandSparkles size={18} />
        <span>DESCRIBE WHAT YOU WANT TO PRACTISE</span>
      </div>
      <textarea
        aria-label="What you want to practise"
        value={prompt}
        maxLength={600}
        rows={3}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={ideas[0]}
      />
      <div className="generate-ideas">
        {ideas.map((idea) => (
          <button type="button" key={idea} onClick={() => setPrompt(idea)}>
            {idea}
          </button>
        ))}
      </div>
      <label className="generation-model">
        <span>Instrumentation</span>
        <input
          aria-label="Instrumentation"
          value={instrumentation}
          maxLength={600}
          onChange={(event) => setInstrumentation(event.target.value)}
          placeholder="e.g. Lead guitar, rhythm guitar, bass, piano and drums"
        />
        <small className="muted-copy">
          Name the parts, sounds and tunings you want. Leave blank for a solo part.
        </small>
      </label>
      {developer && (
        <GenerationModelPicker model={model} disabled={busy || writing} onChange={setModel} />
      )}
      <div className="generate-options">
        <div className="segmented small">
          {(['guitar', 'bass'] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={instrument === value ? 'active' : ''}
              onClick={() => setInstrument(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="segmented small">
          {levels.map((value) => (
            <button
              type="button"
              key={value}
              className={level === value ? 'active' : ''}
              onClick={() => setLevel(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          className="button button-dark"
          disabled={
            busy ||
            writing ||
            prompt.trim().length < 3 ||
            (developer && !validGenerationModel(selectedModel))
          }
        >
          {writing ? <LoaderCircle size={16} className="spin" /> : <WandSparkles size={16} />}{' '}
          {writing ? 'Writing… about a minute' : 'Write it'}
        </button>
      </div>
      <p className="muted-copy">
        Generated with AI via OpenRouter and checked by the notation engine. Treat fingerings as
        suggestions.
      </p>
    </form>
  );
}
