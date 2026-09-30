import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { adopt } from '../../src/platform/adopt';
import { loadConfig } from '../../src/platform/config';
import { startWorkspace, stopWorkspace } from '../../src/platform/workspaces';

let root: string;
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'workspace-adopt-'));
  writeFileSync(
    resolve(root, 'package.json'),
    JSON.stringify({
      name: 'new-app',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', check: 'npm run build' },
      dependencies: {},
    }),
  );
  writeFileSync(
    resolve(root, 'vite.config.ts'),
    "import { defineConfig } from 'vite';\nexport default defineConfig({server:{port:5173}});\n",
  );
  writeFileSync(resolve(root, 'AGENTS.md'), '# Existing project instructions\n');
});
afterEach(async () => {
  if (existsSync(resolve(root, '.git'))) await stopWorkspace(root);
  rmSync(root, { recursive: true });
});
const options = () => ({
  target: root,
  name: 'New App',
  slug: 'new-app',
  origin: 'https://new-app.example',
  port: 8300,
});

describe('adopting the workspace kit', () => {
  it('runs a real Vite app after adoption, including base paths and private readiness', async () => {
    adopt({ ...options(), write: true });
    writeFileSync(resolve(root, 'index.html'), '<!doctype html><h1>New app</h1>');
    symlinkSync(resolve('node_modules'), resolve(root, 'node_modules'), 'dir');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    writeFileSync(
      resolve(root, '.gitignore'),
      readFileSync(resolve(root, '.gitignore'), 'utf8') + '\nnode_modules\n',
    );
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.test');
    git('add', '.');
    git('commit', '-m', 'adopt workspace kit');
    git('switch', '-c', 'dev/try-kit');
    const workspace = await startWorkspace(root);
    const base = `http://127.0.0.1:${workspace.port}/dev/build/${workspace.id}/`;
    expect(await (await fetch(base)).text()).toContain('<h1>New app</h1>');
    expect((await fetch(base + '__workspace/ready')).status).toBe(403);
    expect((await fetch(base + 'src/platform/serve.ts')).status).toBe(403);
  }, 15000);
  it('previews without writing, then creates a self-contained project-specific setup', () => {
    expect(adopt(options())).toContain('workspace.config.json');
    expect(existsSync(resolve(root, 'workspace.config.json'))).toBe(false);
    adopt({ ...options(), write: true });
    expect(loadConfig(root)).toMatchObject({
      name: 'New App',
      slug: 'new-app',
      origin: 'https://new-app.example',
      port: 8300,
      devPortStart: 8310,
    });
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.check).toBe('npm run build');
    expect(pkg.scripts.workspace).toBe('tsx src/platform/cli.ts');
    expect(pkg.dependencies['openid-client']).toBeTruthy();
    expect(pkg.engines.node).toBe('>=22.12.0');
    expect(readFileSync(resolve(root, 'deploy/new-app.service.example'), 'utf8')).toContain(
      `WorkingDirectory=${JSON.stringify(root)}`,
    );
    expect(readFileSync(resolve(root, 'AGENTS.md'), 'utf8')).toContain(
      '# Existing project instructions',
    );
    expect(readFileSync(resolve(root, 'vite.config.ts'), 'utf8')).toContain(
      'workspaceMergeConfig(defineConfig({server:{port:5173}}), workspaceViteConfig())',
    );
    expect(existsSync(resolve(root, '.env'))).toBe(false);
    expect(readFileSync(resolve(root, '.env.example'), 'utf8')).toContain(
      'https://new-app.example/auth/google/callback',
    );
    expect(existsSync(resolve(root, 'src/platform/gateway.ts'))).toBe(true);
    expect(existsSync(resolve(root, '.agents/skills/workspace/SKILL.md'))).toBe(true);
    expect(existsSync(resolve(root, 'src/music'))).toBe(false);
  });
  it('refuses collisions before changing any files', () => {
    const original = readFileSync(resolve(root, 'package.json'), 'utf8');
    writeFileSync(resolve(root, '.env.example'), 'EXISTING_CONFIGURATION=1');
    expect(() => adopt({ ...options(), write: true })).toThrow('Refusing to overwrite');
    expect(readFileSync(resolve(root, 'package.json'), 'utf8')).toBe(original);
    expect(existsSync(resolve(root, 'src'))).toBe(false);
  });
  it('rejects an unsafe origin or invalid port without mutating the target', () => {
    expect(() => adopt({ ...options(), origin: 'http://public.example', write: true })).toThrow(
      'HTTPS',
    );
    expect(() => adopt({ ...options(), port: 65500, write: true })).toThrow('port');
    expect(existsSync(resolve(root, 'src'))).toBe(false);
  });
});
