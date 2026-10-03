import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createApi, type ApiOptions } from '../../src/server/api';
import { GenerationError } from '../../src/server/generate';
import type { SourceHit } from '../../src/domain/sources';
import type { SourceProvider } from '../../src/server/sources/provider';
import { close, listen } from '../platform/gatewayFixture';

const hit = (source: string, id: string): SourceHit => ({
  source,
  id,
  title: `${source} ${id}`,
  artist: '',
  format: 'midi',
  licence: 'Test',
  open: true,
  detail: '',
  url: '',
});
const provider = (id: string, extra: Partial<SourceProvider> = {}): SourceProvider => ({
  id,
  name: id.toUpperCase(),
  note: '',
  ready: () => true,
  search: vi.fn(async () => [hit(id, '1'), hit(id, '2')]),
  file: vi.fn(async () => ({ bytes: new Uint8Array([7, 8]), filename: 'x.mid' })),
  ...extra,
});
let server: Server;
async function start(options: ApiOptions) {
  server = createServer(createApi(options));
  const base = `http://127.0.0.1:${await listen(server)}`;
  return (path: string, init?: RequestInit) => fetch(base + path, init);
}
afterEach(() => close(server));
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const wish = { prompt: 'a blues riff', instrument: 'guitar', level: 'beginner' };

describe('source routes', () => {
  it('lists sources and whether generation is available', async () => {
    const get = await start({
      providers: [provider('a'), provider('b', { ready: () => false })],
      generationReady: () => false,
    });
    expect(await (await get('/sources')).json()).toEqual({
      sources: [
        { id: 'a', name: 'A', note: '', ready: true },
        { id: 'b', name: 'B', note: '', ready: false },
      ],
      generation: false,
    });
  });
  it('interleaves results, reports failed sources and caches repeat searches', async () => {
    const a = provider('a');
    const broken = provider('b', { search: vi.fn(async () => Promise.reject(new Error('down'))) });
    const off = provider('c', { ready: () => false });
    const get = await start({ providers: [a, broken, provider('d'), off] });
    const body = await (await get('/sources/search?q=Blues')).json();
    expect(body.hits.map((h: SourceHit) => `${h.source}${h.id}`)).toEqual(['a1', 'd1', 'a2', 'd2']);
    expect(body.failed).toEqual(['B']);
    await get('/sources/search?q=blues');
    expect(a.search).toHaveBeenCalledTimes(1);
    expect(off.search).not.toHaveBeenCalled();
    expect((await get('/sources/search?q=x')).status).toBe(400);
  });
  it('serves files from loadable sources only', async () => {
    const linkOnly = provider('link', { file: undefined });
    const failing = provider('bad', { file: vi.fn(async () => Promise.reject(new Error('x'))) });
    const get = await start({ providers: [provider('a'), linkOnly, failing] });
    const file = await get('/sources/file?source=a&id=1');
    expect(file.headers.get('content-type')).toContain('application/octet-stream');
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([7, 8]);
    expect((await get('/sources/file?source=link&id=1')).status).toBe(404);
    expect((await get('/sources/file?source=nope&id=1')).status).toBe(404);
    expect((await get('/sources/file?source=bad&id=1')).status).toBe(502);
    expect((await get('/elsewhere')).status).toBe(404);
  });
});

describe('generation route', () => {
  it('validates the request and returns the piece', async () => {
    const generate = vi.fn(async () => ({ alphaTex: ':4 0.6 |' }));
    const call = await start({ providers: [], generate, generationReady: () => true });
    expect(await (await call('/generate', post(wish))).json()).toEqual({ alphaTex: ':4 0.6 |' });
    expect(generate).toHaveBeenCalledWith(wish);
    for (const bad of [
      { ...wish, prompt: 'x' },
      { ...wish, instrument: 'kazoo' },
      { ...wish, level: 1 },
    ])
      expect((await call('/generate', post(bad))).status).toBe(400);
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it('is off without credentials, passes on known failures and enforces the daily limit', async () => {
    let call = await start({ providers: [], generationReady: () => false });
    expect((await call('/generate', post(wish))).status).toBe(503);
    await close(server);
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new GenerationError('The AI declined that request.', 422))
      .mockResolvedValue({ alphaTex: 'x' });
    call = await start({
      providers: [],
      generate,
      generationReady: () => true,
      dailyGenerations: 2,
    });
    const declined = await call('/generate', post(wish));
    expect([declined.status, (await declined.json()).error]).toEqual([
      422,
      'The AI declined that request.',
    ]);
    expect((await call('/generate', post(wish))).status).toBe(200);
    expect((await call('/generate', post(wish))).status).toBe(429);
  });
});
