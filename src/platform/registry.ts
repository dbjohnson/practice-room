import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writePrivate } from './files';
import { git, repository } from './config';

export interface Workspace {
  id: string;
  branch: string;
  root: string;
  port: number;
  controlPort: number;
  pid: number;
  token: string;
  startedAt: string;
}
export const validId = (value: string) => /^[a-z0-9][a-z0-9-]{0,60}$/.test(value);
export function workspaceId(root: string, branch: string) {
  const label =
    branch
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workspace';
  return `${label}-${createHash('sha256')
    .update(root + '\0' + branch)
    .digest('hex')
    .slice(0, 8)}`;
}
export function readWorkspace(path: string): Workspace | null {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Workspace;
    if (
      !validId(value.id) ||
      typeof value.root !== 'string' ||
      typeof value.branch !== 'string' ||
      typeof value.token !== 'string' ||
      value.token.length < 32 ||
      ![value.port, value.controlPort].every(
        (port) => Number.isInteger(port) && port > 1023 && port <= 65535,
      ) ||
      !Number.isInteger(value.pid) ||
      value.pid <= 1
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export async function running(workspace: Workspace) {
  try {
    const response = await fetch(`http://127.0.0.1:${workspace.controlPort}/health`, {
      headers: { authorization: `Bearer ${workspace.token}` },
      signal: AbortSignal.timeout(700),
      redirect: 'error',
    });
    const data = await response.json();
    return response.ok && data.id === workspace.id && data.pid === workspace.pid;
  } catch {
    return false;
  }
}
export async function listWorkspaces(registry: string) {
  if (!existsSync(registry)) return [];
  const entries = readdirSync(registry)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readWorkspace(resolve(registry, name)))
    .filter((value): value is Workspace => !!value);
  const active = await Promise.all(
    entries.map(async (workspace) => {
      try {
        if (
          git(workspace.root, 'branch', '--show-current') !== workspace.branch ||
          repository(workspace.root).registry !== registry
        )
          return null;
        return (await running(workspace)) ? workspace : null;
      } catch {
        return null;
      }
    }),
  );
  return active.filter((value): value is Workspace => !!value);
}
export function register(registry: string, workspace: Workspace) {
  writePrivate(resolve(workspace.root, '.dev-workspace', 'state.json'), workspace);
  writePrivate(resolve(registry, `${workspace.id}.json`), workspace);
}
export function unregister(registry: string, workspace: Workspace) {
  for (const path of [
    resolve(workspace.root, '.dev-workspace', 'state.json'),
    resolve(registry, `${workspace.id}.json`),
  ])
    if (readWorkspace(path)?.token === workspace.token) unlinkSync(path);
}
