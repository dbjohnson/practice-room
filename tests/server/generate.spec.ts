import { describe, expect, it, vi } from 'vitest';
import { alphaTexExample } from '../../src/server/alphaTexGuide';
import { alphaTexErrors, generateScore, type Compose } from '../../src/server/generate';

const request = { prompt: 'blues riff', instrument: 'guitar', level: 'beginner' } as const;
const reply = (text: string, stop_reason: 'end_turn' | 'refusal' | 'max_tokens' = 'end_turn') =>
  ({ stop_reason, content: [{ type: 'text', text, citations: null }] }) as Awaited<
    ReturnType<Compose>
  >;
const valid = '\\title "Riff"\n:4 0.6 3.6 5.6 3.6 |';

describe('alphaTex checking', () => {
  it('accepts the example the model is shown', () => {
    expect(alphaTexErrors(alphaTexExample)).toEqual([]);
  });
  it('reports where a draft is wrong', () => {
    const [first] = alphaTexErrors('\\title "x"\n:4 0.9 |');
    expect(first).toMatch(/^Line 2, column \d+: .*string/i);
  });
});

describe('piece generation', () => {
  it('returns alphaTex from a fenced reply', async () => {
    const compose = vi.fn<Compose>(async () => reply('```alphatex\n' + valid + '\n```'));
    expect(await generateScore(request, compose)).toEqual({ alphaTex: valid });
    expect(compose.mock.calls[0][0][0].content).toContain('Instrument: guitar');
  });
  it('sends parser errors back and keeps the earlier turns unchanged', async () => {
    const draft = reply('```alphatex\n:4 0.9 |\n```');
    const compose = vi
      .fn<Compose>()
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(reply(valid));
    expect(await generateScore(request, compose)).toEqual({ alphaTex: valid });
    const second = compose.mock.calls[1][0];
    expect(second).toHaveLength(3);
    expect(second[1]).toEqual({ role: 'assistant', content: draft.content });
    expect(second[2].content).toContain('Line 1');
  });
  it('gives up after three invalid drafts and explains refusals and overruns', async () => {
    const bad = vi.fn<Compose>(async () => reply('not music'));
    await expect(generateScore(request, bad)).rejects.toThrow('could not write valid notation');
    expect(bad).toHaveBeenCalledTimes(3);
    await expect(generateScore(request, async () => reply('', 'refusal'))).rejects.toMatchObject({
      status: 422,
    });
    await expect(generateScore(request, async () => reply(valid, 'max_tokens'))).rejects.toThrow(
      'too long',
    );
    await expect(
      generateScore(request, async () => {
        throw new Error('socket');
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
