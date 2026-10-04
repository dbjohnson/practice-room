import { afterEach, describe, expect, it, vi } from 'vitest';
import { generationReady, openRouter } from '../../src/server/openrouter';
import { defaultGenerationModel } from '../../src/domain/generation';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const messages = [{ role: 'user' as const, content: 'A riff' }];

describe('OpenRouter transport', () => {
  it('accepts both key spellings and sends the selected model with the notation guide', async () => {
    vi.stubEnv('OPEN_ROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    expect(generationReady()).toBe(true);
    const fetcher = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: ':4 0.6 |' } }],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await openRouter()(messages)).toEqual({ content: ':4 0.6 |', finishReason: 'stop' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(defaultGenerationModel);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages.slice(1)).toEqual(messages);
    await openRouter('other/model')(messages);
    expect(JSON.parse(fetcher.mock.calls[1][1].body).model).toBe('other/model');
  });
  it('does not use Anthropic credentials and fails before making a request without a key', async () => {
    vi.stubEnv('OPEN_ROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'legacy');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(generationReady()).toBe(false);
    await expect(openRouter()(messages)).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [401, 503],
    [402, 503],
    [429, 429],
    [404, 422],
    [500, 502],
  ])(
    'maps upstream %i to an actionable %i without leaking upstream data',
    async (upstream, status) => {
      vi.stubEnv('OPEN_ROUTER_API_KEY', 'test');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('private details', { status: upstream })),
      );
      await expect(openRouter()(messages)).rejects.toMatchObject({ status });
      await expect(openRouter()(messages)).rejects.not.toThrow('private details');
    },
  );
  it('handles in-band errors and provider refusals', async () => {
    vi.stubEnv('OPEN_ROUTER_API_KEY', 'test');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 429 } })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ choices: [{ message: { refusal: 'declined' } }] })),
        ),
    );
    await expect(openRouter()(messages)).rejects.toMatchObject({ status: 429 });
    expect((await openRouter()(messages)).finishReason).toBe('content_filter');
  });
});

it('reports a timeout while reading the response body instead of a generic generation failure', async () => {
  vi.stubEnv('OPEN_ROUTER_API_KEY', 'test');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new DOMException('timed out', 'TimeoutError');
      },
    }),
  );
  await expect(openRouter()(messages)).rejects.toMatchObject({
    status: 504,
    message:
      'The AI service did not finish within three minutes. Try again or choose another model.',
  });
});
