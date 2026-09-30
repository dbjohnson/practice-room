import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createServer, mergeConfig } from 'vite';
import { afterEach, expect, it } from 'vitest';
import { workspaceViteConfig } from '../../src/platform/vite';

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function status(root: string, file: string) {
  const server = await createServer(
    mergeConfig(workspaceViteConfig(), {
      base: '/',
      root,
      configFile: false,
      cacheDir: mkdtempSync(resolve(tmpdir(), 'practice-vite-deny-')),
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
    }),
  );
  try {
    await server.listen();
    const port = (server.httpServer!.address() as AddressInfo).port;
    return (await fetch(`http://127.0.0.1:${port}/@fs${file}`)).status;
  } finally {
    await server.close();
  }
}

function project(...segments: string[]) {
  const base = realpathSync(mkdtempSync(resolve(tmpdir(), 'practice-vite-root-')));
  temporary.push(base);
  const root = resolve(base, ...segments);
  mkdirSync(resolve(root, 'node_modules', 'dep'), { recursive: true });
  const file = resolve(root, 'node_modules', 'dep', 'index.txt');
  writeFileSync(file, 'data\n');
  return { root, file };
}

it('serves files when the project itself lives in a linked worktree', async () => {
  const { root, file } = project('.worktrees', 'feature');
  expect(await status(root, file)).toBe(200);
});

it('still refuses sibling worktrees and the platform kit', async () => {
  const { root } = project('checkout');
  const sibling = resolve(root, '.worktrees', 'other', 'secret.txt');
  const kit = resolve(root, 'src', 'platform', 'serve.txt');
  for (const file of [sibling, kit]) {
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, 'data\n');
    expect(await status(root, file)).toBe(403);
  }
});
