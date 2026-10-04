---
name: wrapup
description: Prepare and open a pull request for this work session, preserving the dev workspace until the user closes it.
---

Use the [rebase skill](../rebase/SKILL.md) to bring this feature branch onto the
latest `origin/main`, preserving local changes. Review the final diff, update
affected documentation and run `npm run check`. Reuse passing results when
their inputs have not changed. Include any failures or remaining limitations.

Commit the session's changes, push the feature branch and open a concise PR
describing resulting behavior and verification. Follow `AGENTS.md` for labels
and UI evidence. Register the full PR URL with the thread's `link_pull_request`
tool when available, then verify it appears in `list_thread_pull_requests`.

Opening a PR does not authorize merging, deploying or closing a dev workspace.
After actual merge and the user's authorization to close the work, run
`npm run workspace -- stop` in this worktree. Remove a linked worktree/branch
only after checking that no uncommitted or unmerged work remains. Do not remove
the primary checkout. Production service changes are separate authorized work.

Once closure is authorized, verify `npm run workspace -- list` no longer includes
the completed session. From another checkout, `npm run workspace -- cleanup`
previews clean, merged worktrees; `cleanup --apply` stops and removes only those
eligible worktrees while keeping branches. Never treat opening a PR as closure.
