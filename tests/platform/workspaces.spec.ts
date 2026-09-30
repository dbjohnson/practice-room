import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repository } from '../../src/platform/config';
import { startWorkspace, stopWorkspace } from '../../src/platform/workspaces';
import { listWorkspaces, readWorkspace, running, workspaceId } from '../../src/platform/registry';

let root: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'workspace-process-'));
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.test');
  writeFileSync(resolve(root, '.gitignore'), 'node_modules\n.dev-workspace\n');
  writeFileSync(
    resolve(root, 'workspace.config.json'),
    JSON.stringify({
      version: 1,
      name: 'Test',
      slug: 'test-app',
      origin: 'https://example.test',
      port: 8300,
      devPortStart: 18500,
      baseBranch: 'main',
      staticDir: 'dist',
      devCommand: [process.execPath, 'server.mjs'],
      installCommand: ['npm', 'ci'],
    }),
  );
  writeFileSync(
    resolve(root, 'server.mjs'),
    `import {createServer} from 'node:http';
createServer((req,res)=>{if(req.headers.authorization!=='Bearer '+process.env.WORKSPACE_RUN_TOKEN){res.writeHead(403).end();return}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:process.env.WORKSPACE_ID}))}).listen(Number(process.env.PORT),'127.0.0.1');`,
  );
  symlinkSync(resolve('node_modules'), resolve(root, 'node_modules'), 'dir');
  git('add', '.');
  git('commit', '-m', 'fixture');
});
afterEach(async () => {
  await stopWorkspace(root);
  rmSync(root, { recursive: true });
});

describe('workspace process lifecycle', () => {
  it('refuses the base branch and detached HEAD', async () => {
    await expect(startWorkspace(root)).rejects.toThrow('feature branch');
    git('checkout', '--detach');
    await expect(startWorkspace(root)).rejects.toThrow('feature branch');
  });
  it('starts once, lists the live branch, then safely stops and restarts', async () => {
    git('switch', '-c', 'dev/test');
    const first = await startWorkspace(root);
    expect(await running(first)).toBe(true);
    expect((await startWorkspace(root)).pid).toBe(first.pid);
    expect(
      (await listWorkspaces(repository(root).registry)).map((workspace) => workspace.id),
    ).toEqual([first.id]);
    const denied = await fetch(`http://127.0.0.1:${first.controlPort}/stop`, { method: 'POST' });
    expect(denied.status).toBe(403);
    await stopWorkspace(root);
    expect(await running(first)).toBe(false);
    expect(readWorkspace(resolve(root, '.dev-workspace/state.json'))).toBeNull();
    const next = await startWorkspace(root);
    expect(next.id).toBe(first.id);
    expect(next.pid).not.toBe(first.pid);
    expect(next.token).not.toBe(first.token);
  }, 15000);
  it('does not list a workspace after its worktree changes branch', async () => {
    git('switch', '-c', 'dev/first');
    await startWorkspace(root);
    git('switch', '-c', 'dev/second');
    expect(await listWorkspaces(repository(root).registry)).toEqual([]);
    await expect(startWorkspace(root)).rejects.toThrow('before changing');
  }, 10000);
  it('prevents concurrent startup and gives colliding branch labels distinct IDs', async () => {
    git('switch', '-c', 'dev/test');
    mkdirSync(resolve(root, '.dev-workspace'));
    writeFileSync(resolve(root, '.dev-workspace/start.lock'), '');
    await expect(startWorkspace(root)).rejects.toThrow('already in progress');
    expect(workspaceId(root, 'a/b')).not.toBe(workspaceId(root, 'a-b'));
  });
});
