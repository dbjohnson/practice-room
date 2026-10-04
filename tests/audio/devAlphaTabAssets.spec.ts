import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import type { Connect, ViteDevServer } from 'vite';
import { expect, it } from 'vitest';
import { devAlphaTabAssets } from '../../src/audio/devAlphaTabAssets';

it('serves a much smaller licensed module to every worker, with gzip negotiation and validators', async () => {
  let handler: Connect.NextHandleFunction;
  const configure = devAlphaTabAssets().configureServer as (server: ViteDevServer) => void;
  configure({
    middlewares: {
      use: (middleware: Connect.NextHandleFunction) => {
        handler = middleware;
      },
    },
  } as unknown as ViteDevServer);
  const server = createServer((req, res) => handler(req, res, () => res.writeHead(404).end()));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    new Promise<{ body: Buffer; status: number; headers: import('node:http').IncomingHttpHeaders }>(
      (resolve, reject) => {
        const req = request(
          {
            hostname: '127.0.0.1',
            port,
            path,
            headers: { connection: 'close', ...headers },
            method,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (data) => chunks.push(data));
            res.on('end', () =>
              resolve({
                body: Buffer.concat(chunks),
                status: res.statusCode!,
                headers: res.headers,
              }),
            );
          },
        );
        req.on('error', reject);
        req.end();
      },
    );
  try {
    const path = '/dev/build/test/node_modules/@coderline/alphatab/dist/alphaTab.core.mjs?v=123';
    const original = readFileSync(
      new URL('./alphaTab.core.mjs', import.meta.resolve('@coderline/alphatab')),
    );
    const compressed = await get(path, { 'accept-encoding': 'br, gzip' });
    expect(compressed.status).toBe(200);
    expect(compressed.headers['content-encoding']).toBe('gzip');
    expect(compressed.body.length).toBeLessThan(original.length / 5);
    const code = gunzipSync(compressed.body);
    const source = original.toString();
    const license = source.slice(0, source.indexOf('*/') + 2);
    expect(code.toString().startsWith(license)).toBe(true);
    expect(code.toString().includes('AlphaTabApi')).toBe(true);
    const plain = await get(path, { 'accept-encoding': 'gzip;q=0' });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body).toEqual(code);
    const unchanged = await get(path, { 'if-none-match': plain.headers.etag! });
    expect(unchanged.status).toBe(304);
    expect(unchanged.body.length).toBe(0);
    expect((await get(path, {}, 'HEAD')).body.length).toBe(0);
    expect((await get('/src/app.ts')).status).toBe(404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  // Real alphaTab minification competes with audio rendering in the full coverage suite.
}, 30000);
