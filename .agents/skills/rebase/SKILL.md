---
name: rebase
description: Update the current development worktree to the latest origin/main by rebasing its branch, preserving local commits and uncommitted changes. Use when asked to rebase or bring a worktree up to date with main.
---

Rebase the session's development branch onto the latest fetched `origin/main`.
The request authorizes the local rebase and routine conflict resolution. Keep
the same worktree and branch; do not create a new dev workspace, change the
production checkout, push, open a PR or deploy as part of this skill.

1. Identify the worktree from the session context and `git worktree list`; run
   every subsequent command in that worktree. Inspect its branch, `HEAD`, status
   (including untracked files), and staged/unstaged diffs. If the shell starts in
   the production checkout or on `main`, locate the session's feature worktree.
   Ask for a target only if it cannot be determined. Do not rewrite `main`, work
   from detached HEAD, or interfere with another unfinished Git operation.
2. Fetch main with `git fetch origin refs/heads/main:refs/remotes/origin/main`
   and record `git rev-parse refs/remotes/origin/main` as the target commit. Stop
   on fetch failure; a stale local ref is not the latest main. Pin this commit
   for the operation, since other worktrees share remote-tracking refs. If it is
   already an ancestor of `HEAD`, report that the branch is current and leave
   local edits untouched.
3. Create a uniquely named local backup branch at the original `HEAD`. For dirty
   worktrees, use `git stash push --include-untracked` with a unique message;
   record the exact stash object ID by that message. Preserve ignored files such
   as `.env`, `.venv` and `.dev-workspace`. Verify that tracked and untracked work
   was saved before proceeding. Stashes are shared across worktrees: never assume
   `stash@{0}` is still this operation's stash, and never clear the stash list.
4. Run `git rebase --no-autostash --no-update-refs --rebase-merges <target-commit>`.
   This keeps other branch refs, including the backup, from moving and retains
   branch merge structure. Resolve routine conflicts by inspecting both changes
   and affected callers, stage only resolved files, and use
   `GIT_EDITOR=true git rebase --continue`. Preserve both intentions; do not use
   blanket ours/theirs choices or skip commits to silence conflicts. Update
   affected documentation when necessary. If a genuine
   product decision blocks resolution, ask that specific question and retain the
   recovery refs and conflict state. To abandon this rebase, use `git rebase
   --abort` before restoring saved edits; never use a hard reset or clean.
5. After a successful rebase, restore the exact saved stash with
   `git stash apply --index <stash-object-id>`, preserving staging where possible.
   Resolve restoration conflicts separately from rebase conflicts. A failed apply
   can partially restore files: inspect that state before doing anything further,
   and keep the stash until every local change, including untracked files, is
   accounted for. Report any staging distinction that could not be preserved.
   Once restoration is verified, drop only this operation's stash, resolving its
   current selector by object ID. Retain the backup branch as a recovery point.
6. Verify the target is an ancestor of `HEAD` with
   `git merge-base --is-ancestor <target-commit> HEAD`, inspect the final diff and
   status, and confirm no unresolved entries or rebase state remain. Review the
   rebased commits against the backup, using `git range-diff` when useful. Sync
   dependencies with `npm ci` if they changed; run lint and the smallest tests
   covering conflict resolutions and affected interfaces. Apply the repository's
   broader verification rules where relevant; full PR checks belong to the
   [workspace workflow](../../../docs/workspaces.md).

Report the worktree/branch, fetched main commit, conflict resolutions, checks and
any remaining limitations, plus the backup ref and any stash retained for recovery.

Git references: [rebase](https://git-scm.com/docs/git-rebase) and
[stash](https://git-scm.com/docs/git-stash).
