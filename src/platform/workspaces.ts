import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { git, loadConfig, repository } from './config';
import { readWorkspace, running, unregister } from './registry';

export async function freePort(first: number) {
  for (let port = first; port < first + 100; port++) {
    const available = await new Promise<boolean>((done) => {
      const probe = createServer();
      probe.once('error', () => done(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
    });
    if (available) return port;
  }
  throw new Error('No free dev port in the configured range.');
}

export async function startWorkspace(root: string) {
  const directory = resolve(root, '.dev-workspace');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = resolve(directory, 'start.lock');
  let descriptor: number;
  try {
    descriptor = openSync(lock, 'wx', 0o600);
  } catch {
    throw new Error(
      'Workspace startup is already in progress. If interrupted, inspect .dev-workspace/start.lock before removing it.',
    );
  }
  closeSync(descriptor);
  try {
    return await startLocked(root);
  } finally {
    unlinkSync(lock);
  }
}

async function startLocked(root: string) {
  const repo = repository(root);
  const config = loadConfig(root);
  const branch = git(root, 'branch', '--show-current');
  if (!branch || branch === config.baseBranch)
    throw new Error('Start work on a feature branch; use npm run workspace -- new <name>.');
  const statePath = resolve(root, '.dev-workspace', 'state.json');
  const existing = readWorkspace(statePath);
  if (existing && (await running(existing))) {
    if (existing.branch !== branch)
      throw new Error('Stop the workspace before changing its branch.');
    return existing;
  }
  if (existing) unregister(repo.registry, existing);
  const port = await freePort(config.devPortStart);
  mkdirSync(resolve(root, '.dev-workspace'), { recursive: true, mode: 0o700 });
  const log = openSync(resolve(root, '.dev-workspace', 'server.log'), 'a', 0o600);
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(new URL('./runner.ts', import.meta.url)), root, String(port)],
    {
      cwd: root,
      detached: true,
      stdio: ['ignore', log, log],
    },
  );
  closeSync(log);
  child.unref();
  for (let attempt = 0; attempt < 120; attempt++) {
    const state = readWorkspace(statePath);
    if (state && state.pid === child.pid && (await running(state))) return state;
    if (child.exitCode !== null) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Dev server failed to start; inspect .dev-workspace/server.log.');
}

export async function stopWorkspace(root: string) {
  const repo = repository(root);
  const workspace = readWorkspace(resolve(root, '.dev-workspace', 'state.json'));
  if (!workspace) return;
  if (workspace.root !== repo.root) throw new Error('Workspace state belongs to another worktree.');
  if (await running(workspace)) {
    const response = await fetch(`http://127.0.0.1:${workspace.controlPort}/stop`, {
      method: 'POST',
      headers: { authorization: `Bearer ${workspace.token}` },
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Workspace refused the stop request.');
    for (let attempt = 0; attempt < 25; attempt++) {
      if (!(await running(workspace))) break;
      await new Promise((done) => setTimeout(done, 200));
    }
    if (await running(workspace)) throw new Error('Workspace did not stop; state was retained.');
  }
  unregister(repo.registry, workspace);
}

export function newWorktree(root: string, name: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(name))
    throw new Error('Use a short lowercase name with hyphens.');
  const config = loadConfig(root);
  const path = resolve(root, '.worktrees', name);
  if (existsSync(path)) throw new Error('That worktree directory already exists.');
  git(
    root,
    'fetch',
    'origin',
    `refs/heads/${config.baseBranch}:refs/remotes/origin/${config.baseBranch}`,
  );
  const commit = git(root, 'rev-parse', `refs/remotes/origin/${config.baseBranch}`);
  git(root, 'worktree', 'add', '-b', `dev/${name}`, path, commit);
  const [command, ...args] = config.installCommand;
  const result = spawnSync(command, args, { cwd: path, stdio: 'inherit' });
  if (result.status !== 0)
    throw new Error(`Dependency installation failed. Worktree retained at ${path}.`);
  return path;
}
