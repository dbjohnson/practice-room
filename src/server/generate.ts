import Anthropic from '@anthropic-ai/sdk';
import { importer, Settings } from '@coderline/alphatab';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { alphaTexGuide } from './alphaTexGuide';

export interface GenerateRequest {
  prompt: string;
  instrument: 'guitar' | 'bass';
  level: 'beginner' | 'intermediate' | 'advanced';
}
export type Compose = (
  messages: Anthropic.Beta.BetaMessageParam[],
) => Promise<Pick<Anthropic.Beta.BetaMessage, 'content' | 'stop_reason'>>;

/** A failure the player can act on, with the HTTP status the API should answer. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** The SDK reads a key from the environment or a profile saved by `ant auth login`. */
export const generationReady = () =>
  !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) ||
  existsSync(resolve(homedir(), '.config/anthropic'));

/** Returns the parser's complaints, with positions, or an empty list for valid alphaTex. */
export function alphaTexErrors(tex: string): string[] {
  const parser = new importer.AlphaTexImporter();
  parser.logErrors = false;
  try {
    parser.initFromString(tex, new Settings());
    const score = parser.readScore();
    if (!score.tracks.length || !score.masterBars.length) return ['The score has no bars.'];
    return [];
  } catch (error) {
    const found = [
      ...parser.lexerDiagnostics,
      ...parser.parserDiagnostics,
      ...parser.semanticDiagnostics,
    ]
      .filter((item) => item.severity === 2)
      .slice(0, 12)
      .map((item) => `Line ${item.start?.line}, column ${item.start?.col}: ${item.message}`);
    return found.length ? found : [error instanceof Error ? error.message : 'Unreadable alphaTex.'];
  }
}

function claude(): Compose {
  const client = new Anthropic();
  return (messages) =>
    client.beta.messages
      .stream({
        model: 'claude-opus-5-5',
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        // If a safety classifier declines, the API retries on the model Anthropic recommends.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: alphaTexGuide, cache_control: { type: 'ephemeral' } }],
        messages,
      })
      .finalMessage();
}

function explain(error: unknown): GenerationError {
  if (error instanceof GenerationError) return error;
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return new GenerationError(
      'The server’s Anthropic key was rejected. Check ANTHROPIC_API_KEY.',
      503,
    );
  if (error instanceof Anthropic.RateLimitError)
    return new GenerationError('The AI service is busy. Try again in a minute.', 429);
  if (error instanceof Anthropic.APIConnectionError)
    return new GenerationError('Could not reach the AI service. Check the server’s connection.');
  if (error instanceof Anthropic.APIError)
    return new GenerationError(`The AI service answered ${error.status ?? 'an error'}. Try again.`);
  return new GenerationError('Could not write that piece. Try again.');
}

/**
 * Asks Claude for a piece and returns alphaTex that alphaTab has accepted. A rejected draft
 * goes back with the parser's messages, at most twice, keeping the conversation append-only.
 */
export async function generateScore(request: GenerateRequest, compose: Compose = claude()) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: `Instrument: ${request.instrument}\nLevel: ${request.level}\n\nWhat I want to practise: ${request.prompt}`,
    },
  ];
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const reply = await compose(messages);
      if (reply.stop_reason === 'refusal')
        throw new GenerationError(
          'The AI declined that request. Try describing it differently.',
          422,
        );
      if (reply.stop_reason === 'max_tokens')
        throw new GenerationError('That piece came out too long. Ask for fewer bars.', 422);
      const text = reply.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n');
      const alphaTex = (/```[a-z]*\n([\s\S]*?)```/i.exec(text)?.[1] ?? text).trim();
      const errors = alphaTex ? alphaTexErrors(alphaTex) : ['The reply contained no alphaTex.'];
      if (!errors.length) return { alphaTex };
      messages.push(
        { role: 'assistant', content: reply.content as Anthropic.Beta.BetaContentBlockParam[] },
        {
          role: 'user',
          content: `alphaTab could not read that. Its messages:\n${errors.join('\n')}\n\nSend the whole corrected piece again in one fenced block.`,
        },
      );
    }
  } catch (error) {
    throw explain(error);
  }
  throw new GenerationError(
    'The AI could not write valid notation for that. Try a simpler request.',
  );
}
