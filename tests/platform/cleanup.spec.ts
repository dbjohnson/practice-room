import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupCandidates, cleanupWorkspaces } from '../../src/platform/cleanup';

let root: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'cleanup-test-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.test');
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
      devCommand: ['node'],
      installCommand: ['npm', 'ci'],
    }),
  );
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  git(root, 'remote', 'add', 'origin', root);
  git(root, 'fetch', 'origin');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function worktree(name: string) {
  const path = resolve(root, name);
  git(root, 'worktree', 'add', '-b', `dev/${name}`, path);
  return path;
}

describe('workspace cleanup', () => {
  it('previews without deleting, applies only to clean merged linked worktrees, and retains branches', async () => {
    const merged = worktree('merged');
    const dirty = worktree('dirty');
    const unmerged = worktree('unmerged');
    const locked = worktree('locked');
    writeFileSync(resolve(dirty, 'unfinished'), 'keep');
    writeFileSync(resolve(unmerged, 'work'), 'keep');
    git(unmerged, 'add', '.');
    git(unmerged, 'commit', '-m', 'unfinished');
    git(root, 'worktree', 'lock', locked);
    expect(
      cleanupCandidates(root)
        .filter((c) => c.removable)
        .map((c) => c.root),
    ).toEqual([merged]);
    await cleanupWorkspaces(root);
    expect(existsSync(merged)).toBe(true);
    await cleanupWorkspaces(root, true);
    expect(existsSync(merged)).toBe(false);
    for (const path of [root, dirty, unmerged, locked]) expect(existsSync(path)).toBe(true);
    expect(git(root, 'rev-parse', '--verify', 'dev/merged').toString().trim()).toBeTruthy();
  });
  it('protects the calling worktree and primary checkout', () => {
    const current = worktree('current');
    expect(cleanupCandidates(current)).toEqual([]);
  });
  it('requires a fetched remote base and refuses cleanup when refresh fails', async () => {
    worktree('keep');
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
    expect(() => cleanupCandidates(root)).toThrow();
    git(root, 'remote', 'set-url', 'origin', resolve(root, 'missing'));
    await expect(cleanupWorkspaces(root, true)).rejects.toThrow();
    expect(existsSync(resolve(root, 'keep'))).toBe(true);
  });
});
