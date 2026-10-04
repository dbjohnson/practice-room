import { useState } from 'react';
import { defaultGenerationModel, validGenerationModel } from '../domain/generation';
import { readLocal, writeLocal } from '../storage/library';
import { getWorkspaceSession } from '../workspace/client';

export function useGenerationModel() {
  const developer = getWorkspaceSession()?.developer ?? import.meta.env.DEV;
  const [model, change] = useState(() => {
    const saved = readLocal<unknown>('generation-model', defaultGenerationModel);
    return validGenerationModel(saved) ? saved : defaultGenerationModel;
  });
  const selectedModel = developer ? model.trim() || defaultGenerationModel : defaultGenerationModel;
  const setModel = (value: string) => {
    change(value);
    if (validGenerationModel(value.trim()) || !value.trim())
      writeLocal('generation-model', value.trim() || defaultGenerationModel);
  };
  return { developer, model, selectedModel, setModel };
}
