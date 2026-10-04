export const defaultGenerationModel = 'anthropic/claude-sonnet-5.5';
export const validGenerationModel = (model: unknown): model is string =>
  typeof model === 'string' &&
  model.length <= 160 &&
  /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._:/-]+$/.test(model);

export interface GenerateInput {
  prompt: string;
  instrument: 'guitar' | 'bass';
  level: 'beginner' | 'intermediate' | 'advanced';
  model?: string;
  /** Named parts, their instruments/tunings, and roles in the arrangement. */
  instrumentation?: string;
  /** Full current notation when editing; omitted for a new composition. */
  currentScore?: string;
  /** Recent successful edit instructions along the selected version's ancestry. */
  history?: string[];
}

export interface GenerationModel {
  id: string;
  name: string;
}

export const maxEditableScoreLength = 200_000;
