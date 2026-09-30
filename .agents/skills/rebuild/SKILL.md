---
name: rebuild
description: Build and verify this web app, and restart its dev workspace when requested. Does not deploy production.
---

Run `npm run build` in the session's worktree. When changes affect runtime
behavior, run the focused tests and lint required by `AGENTS.md`; for complete
pre-PR verification use `npm run check`.

Vite reloads ordinary application edits. Use `npm run workspace -- restart`
when startup configuration or dependencies changed, or the user requests a
restart. Report the result and the verified build link using the link skill.
Deployment and restarting the public gateway require the user's authorization.
