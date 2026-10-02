---
name: update
description: Update the production site on om to the latest main, rebuilding and restarting the service. Use only when the user asks to deploy, update or release production.
---

Deploying is the user's call. Proceed only when they have asked for it in this
conversation; a merged PR alone does not authorize it. Read the production
section of [workspace operations](../../../docs/workspaces.md) first.

Production is the systemd **user** unit `practice-room.service`. It serves
`dist/` from the primary checkout (its `WorkingDirectory`, normally
`~/code/practice-room`), so work there, not in a dev worktree.

1. Confirm the checkout: `systemctl --user cat practice-room` shows the
   `WorkingDirectory`. In it, `git status -sb` must be clean and on `main`.
   Stop and ask if it is dirty or on another branch.
2. Note the current commit (`git rev-parse --short HEAD`) for rollback, then
   `git pull --ff-only origin main`. If it cannot fast-forward, stop and report.
3. See what changed: `git diff --stat <previous> HEAD -- src/platform package.json package-lock.json`.
4. Run `npm ci`, then `npm run build`. A failed build leaves the previous
   `dist/` contents partly replaced, so fix or roll back before leaving.
5. Restart with `systemctl --user restart practice-room` when step 3 showed
   changes under `src/platform/` or in dependencies. A build with only
   application changes is served without a restart. Sign-in sessions persist
   across a restart.
6. Verify, and report each result:
   - `systemctl --user is-active practice-room` is `active`.
   - `curl -s https://practice.loomen.net/health` returns `{"app":"practice-room","status":"ok"}`.
   - `curl -s -o /dev/null -w '%{http_code}' https://practice.loomen.net/` returns `302` (the sign-in redirect).
   - `journalctl --user -u practice-room -n 5 --no-pager` shows a clean start.

These checks confirm the gateway is serving; they do not sign in. Say that the
app itself was not opened unless you verified it in a signed-in browser.

Rolling back means moving `main` in that checkout back to the commit noted in
step 2 (`git reset --hard <previous>`), then repeating steps 4 to 6. That
discards nothing on GitHub but leaves the checkout behind `origin/main`, so do
it only with the user's agreement and say so afterwards.

Do not change the service unit, DNS or the Cloudflare tunnel, and do not stop
running dev workspaces; they are separate processes. Report the deployed commit
and anything that could not be verified.
