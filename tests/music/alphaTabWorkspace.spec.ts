import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { expect, it } from 'vitest';

it('serves alphaTab workers and their Vite environment under a dev-build base', async () => {
  const cacheDir = mkdtempSync(resolve(tmpdir(), 'practice-vite-worker-'));
  const base = '/dev/build/worker-check/';
  const server = await createServer({
    configFile: resolve('vite.config.ts'),
    cacheDir,
    base,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
    for (const type of ['worker_module', 'audio_worklet']) {
      const response = await fetch(
        `${origin}${base}node_modules/@coderline/alphatab/dist/alphaTab.worker.mjs?alphatab_worker&type=${type}`,
      );
      expect(response.status).toBe(200);
      const environmentImport = /^import "([^"]+)"/.exec(await response.text())?.[1];
      expect(environmentImport?.startsWith(base)).toBe(true);
      expect((await fetch(`${origin}${environmentImport}`)).status).toBe(200);
    }
    expect((await fetch(`${origin}${base}@vite/env`)).status).toBe(200);
  } finally {
    await server.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
}, 15000);
