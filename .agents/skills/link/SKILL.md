---
name: link
description: Provide a verified link to this session's dev build.
---

Run `npm run workspace -- status` in the session's worktree. If stopped, use
`npm run workspace -- start`. Share the printed `Build link:` URL: the hosted
gateway signs developers in with Google, then opens this branch's dev server.

The origin comes from `workspace.config.json`. Verify the gateway is reachable
before claiming the public link works. If it is not yet deployed, state that
and provide the printed local URL with localhost-forwarding guidance. Do not
start, restart or change the public service merely to produce a link.
