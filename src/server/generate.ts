import { importer, Settings } from '@coderline/alphatab';
import type { GenerateInput } from '../domain/generation';
import { openRouter, GenerationError, type Compose, type Message } from './openrouter';

export { GenerationError, generationReady, type Compose } from './openrouter';
export type GenerateRequest = GenerateInput;

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

/**
 * Asks the selected model for a piece and returns alphaTex that alphaTab has accepted. A rejected draft
 * goes back with the parser's messages, at most twice, keeping the conversation append-only.
 */
export async function generateScore(
  request: GenerateRequest,
  compose: Compose = openRouter(request.model),
) {
  const messages: Message[] = [
    {
      role: 'user',
      content: [
        `Practice instrument: ${request.instrument}\nLevel: ${request.level}`,
        `Instrumentation: ${request.instrumentation || (request.currentScore ? 'Keep the current parts unless the edit asks to change them.' : `Solo ${request.instrument}.`)}`,
        ...(request.currentScore
          ? [
              'Edit the current score below. Preserve its musical content, tracks, structure, tempo and title except where the player requests changes. Return the complete revised score, never a fragment.',
              `Earlier edit requests for context (already applied):\n${request.history?.join('\n') || 'None.'}`,
              `Current score:\n<current-score>\n${request.currentScore}\n</current-score>`,
              `Requested edit: ${request.prompt}`,
            ]
          : [`What I want to practise: ${request.prompt}`]),
      ].join('\n\n'),
    },
  ];
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const reply = await compose(messages);
      if (reply.finishReason === 'content_filter')
        throw new GenerationError(
          'The AI declined that request. Try describing it differently.',
          422,
        );
      if (reply.finishReason === 'length')
        throw new GenerationError('That piece came out too long. Ask for fewer bars.', 422);
      const text = reply.content;
      const alphaTex = (/```[a-z]*\n([\s\S]*?)```/i.exec(text)?.[1] ?? text).trim();
      const errors = alphaTex ? alphaTexErrors(alphaTex) : ['The reply contained no alphaTex.'];
      if (!errors.length) return { alphaTex };
      messages.push(
        { role: 'assistant', content: reply.content },
        {
          role: 'user',
          content: `alphaTab could not read that. Its messages:\n${errors.join('\n')}\n\nSend the whole corrected piece again in one fenced block.`,
        },
      );
    }
  } catch (error) {
    throw error instanceof GenerationError
      ? error
      : new GenerationError('Could not write that piece. Try again.');
  }
  throw new GenerationError(
    'The AI could not write valid notation for that. Try a simpler request.',
  );
}
