import { resolve } from 'node:path';
import { git, loadConfig, repository } from './config';
import { stopWorkspace } from './workspaces';

export interface CleanupCandidate {
  root: string;
  branch: string;
  removable: boolean;
  reason: string;
  removed?: boolean;
}

/** Inspect linked worktrees against the last fetched base. Never infer a squash merge. */
export function cleanupCandidates(root: string): CleanupCandidate[] {
  const repo = repository(root);
  const config = loadConfig(root);
  const base = `refs/remotes/origin/${config.baseBranch}`;
  // Fail closed if the remote base is missing.
  git(root, 'rev-parse', '--verify', base);
  const records = git(root, 'worktree', 'list', '--porcelain', '-z').split('\0\0');
  return records.flatMap((record, index) => {
    const fields = record.split('\0');
    const path = fields.find((field) => field.startsWith('worktree '))?.slice(9);
    if (!path || index === 0 || resolve(path) === repo.root) return [];
    const branch = fields.find((field) => field.startsWith('branch refs/heads/'))?.slice(18) ?? '';
    let reason: string;
    if (fields.some((field) => /^(locked|prunable)( |$)/.test(field)))
      reason = 'locked or prunable';
    else if (!branch.startsWith('dev/') || branch === config.baseBranch)
      reason = 'not a dev branch';
    else {
      try {
        if (repository(path).common !== repo.common) reason = 'different repository';
        else if (git(path, 'status', '--porcelain', '--untracked-files=all'))
          reason = 'uncommitted changes';
        else {
          git(path, 'merge-base', '--is-ancestor', 'HEAD', base);
          reason = 'clean and merged';
        }
      } catch {
        reason = 'unmerged or unavailable';
      }
    }
    return [{ root: path, branch, removable: reason === 'clean and merged', reason }];
  });
}

/** Only an explicit cleanup --apply stops servers and removes worktrees; branches remain. */
export async function cleanupWorkspaces(root: string, apply = false) {
  if (apply) {
    const config = loadConfig(root);
    git(
      root,
      'fetch',
      'origin',
      `refs/heads/${config.baseBranch}:refs/remotes/origin/${config.baseBranch}`,
    );
  }
  const candidates = cleanupCandidates(root);
  for (const candidate of candidates) {
    if (!apply || !candidate.removable) continue;
    // Recheck immediately before each mutation, including after the stop request.
    if (!cleanupCandidates(root).find((item) => item.root === candidate.root)?.removable) continue;
    await stopWorkspace(candidate.root);
    if (!cleanupCandidates(root).find((item) => item.root === candidate.root)?.removable) continue;
    git(root, 'worktree', 'remove', candidate.root);
    candidate.removed = true;
  }
  return candidates;
}
