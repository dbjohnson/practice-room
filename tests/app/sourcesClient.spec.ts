// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generatePiece } from '../../src/app/sourcesClient';

declare const jsdom: { window: Window };
beforeEach(() => {
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  localStorage.clear();
});
const input = { prompt: 'A blues riff', instrument: 'guitar', level: 'beginner' } as const;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('polls a long generation without sending the prompt again', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ jobId: 'job-one' }, 202))
    .mockResolvedValueOnce(json({ pending: true }, 202))
    .mockResolvedValueOnce(json({ alphaTex: ':4 0.6 |' }));
  vi.stubGlobal('fetch', fetcher);
  const result = generatePiece(input);
  await vi.advanceTimersByTimeAsync(3100);
  expect(await result).toEqual({ alphaTex: ':4 0.6 |' });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[0][1].headers.Prefer).toBe('respond-async');
  expect(String(fetcher.mock.calls[1][0])).toContain('/api/generation/jobs/job-one');
  expect(fetcher.mock.calls[1][1].body).toBeUndefined();
});
it('reports proxy errors with their status instead of saying the server is missing', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('<html>Timeout</html>', {
        status: 524,
        headers: { 'Content-Type': 'text/html' },
      }),
    ),
  );
  await expect(generatePiece(input)).rejects.toThrow('HTTP 524');
});
it('preserves an actionable generation error from job polling', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({ jobId: 'job-one' }, 202))
      .mockResolvedValueOnce(json({ error: 'Ask for fewer bars.' }, 422)),
  );
  const result = expect(generatePiece(input)).rejects.toThrow('Ask for fewer bars.');
  await vi.advanceTimersByTimeAsync(1600);
  await result;
});

it('recognizes sign-in redirects instead of blaming missing server setup', async () => {
  const response = new Response('<html>Sign in</html>', {
    headers: { 'Content-Type': 'text/html' },
  });
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: 'https://practice.loomen.net/login?returnTo=x' },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  await expect(generatePiece(input)).rejects.toThrow('Your session has ended');
});
