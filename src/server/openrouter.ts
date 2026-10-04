import { defaultGenerationModel, type GenerationModel } from '../domain/generation';
import { alphaTexGuide } from './alphaTexGuide';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}
export type Compose = (messages: Message[]) => Promise<{
  content: string;
  finishReason: string;
}>;

/** A failure the player can act on, with the HTTP status the API should answer. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

const apiKey = () => (process.env.OPEN_ROUTER_API_KEY || process.env.OPENROUTER_API_KEY)?.trim();
export const generationReady = () => !!apiKey();

function serviceError(status: number): GenerationError {
  if (status === 401 || status === 403)
    return new GenerationError(
      'The server’s OpenRouter key was rejected. Check OPEN_ROUTER_API_KEY.',
      503,
    );
  if (status === 402)
    return new GenerationError('The server’s OpenRouter account needs more credits.', 503);
  if (status === 429)
    return new GenerationError('The AI service is busy. Try again in a minute.', 429);
  if (status === 400 || status === 404)
    return new GenerationError(
      'OpenRouter could not use that model. Check the model ID or choose another model.',
      422,
    );
  return new GenerationError(`The AI service answered ${status}. Try again.`);
}

export function openRouter(model = defaultGenerationModel): Compose {
  return async (messages) => {
    const key = apiKey();
    if (!key)
      throw new GenerationError('AI generation needs OPEN_ROUTER_API_KEY on the server.', 503);
    const signal = AbortSignal.timeout(180_000);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 32000,
          messages: [{ role: 'system', content: alphaTexGuide }, ...messages],
        }),
        signal,
      });
      if (!response.ok) throw serviceError(response.status);
      const body = (await response.json()) as {
        error?: { code?: number };
        choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[];
      };
      if (body.error) throw serviceError(body.error.code ?? 502);
      const choice = body.choices?.[0];
      if (!choice?.message)
        throw new GenerationError('The AI service returned an empty reply. Try again.');
      return {
        content: typeof choice.message.content === 'string' ? choice.message.content : '',
        finishReason: choice.message.refusal ? 'content_filter' : (choice.finish_reason ?? 'stop'),
      };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError'))
        throw new GenerationError(
          'The AI service did not finish within three minutes. Try again or choose another model.',
          504,
        );
      if (error instanceof SyntaxError)
        throw new GenerationError('The AI service returned an unreadable response. Try again.');
      throw new GenerationError('The connection to the AI service was interrupted. Try again.');
    }
  };
}

let cachedModels: { at: number; models: GenerationModel[] } | undefined;
export async function generationModels(): Promise<GenerationModel[]> {
  if (cachedModels && Date.now() - cachedModels.at < 60 * 60_000) return cachedModels.models;
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw serviceError(response.status);
  const body = (await response.json()) as {
    data: { id: string; name: string; architecture?: { output_modalities?: string[] } }[];
  };
  const models = body.data
    .filter((model) => model.architecture?.output_modalities?.includes('text'))
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cachedModels = { at: Date.now(), models };
  return models;
}
