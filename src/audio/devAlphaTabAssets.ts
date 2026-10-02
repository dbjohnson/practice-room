import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { minifySync } from 'rolldown/utils';
import type { Plugin } from 'vite';

/** The same engine is imported by the page, synth worker and notation worker. */
export function devAlphaTabAssets(): Plugin {
  return {
    name: 'compact-alphatab-dev-assets',
    apply: 'serve',
    configureServer(server) {
      const path = fileURLToPath(
        new URL('./alphaTab.core.mjs', import.meta.resolve('@coderline/alphatab')),
      );
      const source = readFileSync(path, 'utf8');
      const result = minifySync(path, source, { module: true });
      if (result.errors.length)
        throw new Error('alphaTab development module could not be prepared.');
      const license = source.slice(0, source.indexOf('*/') + 2);
      const bytes = Buffer.from(`${license}\n${result.code}`);
      const compressed = gzipSync(bytes);
      const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (
          !url.pathname.endsWith('/node_modules/@coderline/alphatab/dist/alphaTab.core.mjs') ||
          !['GET', 'HEAD'].includes(request.method ?? '')
        ) {
          next();
          return;
        }
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.setHeader('Cache-Control', 'max-age=31536000, immutable');
        response.setHeader('Vary', 'Accept-Encoding');
        response.setHeader('ETag', etag);
        if (request.headers['if-none-match'] === etag) {
          response.writeHead(304).end();
          return;
        }
        const gzip = (request.headers['accept-encoding'] ?? '').split(',').some((encoding) => {
          const match = encoding.trim().match(/^gzip(?:\s*;\s*q=([0-9.]+))?$/i);
          return match && (match[1] === undefined || Number(match[1]) > 0);
        });
        if (gzip) response.setHeader('Content-Encoding', 'gzip');
        const body = gzip ? compressed : bytes;
        response.setHeader('Content-Length', body.length);
        response.end(request.method === 'HEAD' ? undefined : body);
      });
    },
  };
}
