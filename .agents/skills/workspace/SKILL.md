---
name: workspace
description: Create or manage an isolated branch and dev server for this app, including start, status, restart and stop.
---

Read [workspace operations](../../../docs/workspaces.md). For a new task from
the base branch, run `npm run workspace -- new <descriptive-name>` and continue
in the printed worktree. It fetches the configured base, creates a `dev/` branch
and worktree, installs dependencies and starts its server. On an existing
feature branch, use `npm run workspace -- start`; reuse the session's worktree.

Give the build link promptly using the [link skill](../link/SKILL.md). Manage
only this session's server with `status`, `restart` or `stop`. `stop` preserves
the branch, worktree and browser-local data. Do not copy production credentials
into worktrees, signal stored PIDs manually or alter the production service.

When adopting this pattern in another app, run `npm run workspace:adopt -- --help`
and preview proposed changes before using its `--write` option. The target must
supply its own origin, ports and credentials; do not transfer `.env`.

Startup reports clean, merged workspaces left behind. When the owner asks to clean
stale builds, run `npm run workspace -- cleanup` to inspect and `cleanup --apply`
to stop and remove clean, merged linked worktrees. This request authorizes cleanup;
do not ask again. Unmerged work can be stopped explicitly but must be retained.
Use `list` afterward to verify the remaining servers.
