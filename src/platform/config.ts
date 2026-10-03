import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

export interface WorkspaceConfig {
  version: 1;
  name: string;
  slug: string;
  origin: string;
  port: number;
  devPortStart: number;
  baseBranch: string;
  staticDir: string;
  devCommand: string[];
  installCommand: string[];
  /** Optional module whose default export returns the app's /api request handler. */
  api?: string;
}

export function git(root: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function repository(cwd = process.cwd()) {
  const root = realpathSync(git(cwd, 'rev-parse', '--show-toplevel'));
  const common = git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return { root, common, registry: resolve(common, 'workspace-kit', 'workspaces') };
}

export function inside(root: string, path: string) {
  const full = resolve(root, path);
  if (isAbsolute(path) || !full.startsWith(resolve(root) + sep))
    throw new Error('Expected a path inside the project.');
  return full;
}

export function loadConfig(root: string): WorkspaceConfig {
  const config = JSON.parse(readFileSync(resolve(root, 'workspace.config.json'), 'utf8'));
  if (config.version !== 1 || !/^[a-z][a-z0-9-]{1,48}$/.test(config.slug))
    throw new Error('Invalid workspace config version or slug.');
  if (
    typeof config.name !== 'string' ||
    !config.name.trim() ||
    typeof config.baseBranch !== 'string'
  )
    throw new Error('Workspace name and baseBranch are required.');
  const origin = new URL(config.origin);
  if (
    origin.origin !== config.origin ||
    origin.username ||
    origin.password ||
    (origin.protocol !== 'https:' &&
      !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))
  )
    throw new Error('origin must be an HTTPS origin (HTTP is allowed only on loopback).');
  for (const port of [config.port, config.devPortStart])
    if (!Number.isInteger(port) || port < 1024 || port > 65000)
      throw new Error('Invalid workspace port.');
  for (const command of [config.devCommand, config.installCommand])
    if (
      !Array.isArray(command) ||
      !command.length ||
      command.some((part) => typeof part !== 'string')
    )
      throw new Error('Commands must be nonempty arrays of arguments.');
  inside(root, config.staticDir);
  if (config.api !== undefined) {
    if (typeof config.api !== 'string') throw new Error('api must be a module path.');
    inside(root, config.api);
  }
  return config;
}

export function emails(value = '') {
  return new Set(
    value
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}
