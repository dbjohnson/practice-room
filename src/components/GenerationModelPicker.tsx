import { useEffect, useId, useState } from 'react';
import { listGenerationModels } from '../app/sourcesClient';
import { defaultGenerationModel, type GenerationModel } from '../domain/generation';

export function GenerationModelPicker({
  model,
  onChange,
  disabled,
}: {
  model: string;
  onChange: (model: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [models, setModels] = useState<GenerationModel[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void listGenerationModels(abort.signal)
      .then(({ models }) => setModels(models))
      .catch(() => {
        if (!abort.signal.aborted) setUnavailable(true);
      });
    return () => abort.abort();
  }, []);
  return (
    <label className="generation-model">
      <span>Generation model</span>
      <input
        aria-label="Generation model"
        list={id}
        value={model}
        maxLength={160}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={defaultGenerationModel}
      />
      <datalist id={id}>
        {!models.some(({ id }) => id === defaultGenerationModel) && (
          <option value={defaultGenerationModel}>Claude Sonnet 5.5</option>
        )}
        {models.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </datalist>
      <small className="muted-copy">
        {unavailable
          ? 'Model list unavailable. Enter an OpenRouter model ID.'
          : 'Choose or type an OpenRouter model ID. Remembered in this browser.'}
      </small>
    </label>
  );
}
