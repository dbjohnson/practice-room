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

For browser verification, use the local URL to avoid Google sign-in. If the preview
runs on another computer, localhost refers to that computer: forward the dev port
from the server with `ssh -N -L <local-port>:127.0.0.1:<dev-port> <user>@<server>`,
then use `http://localhost:<local-port>/dev/build/<id>/`. A refused local connection
is a forwarding issue, not a reason to remove public authentication or repeatedly
navigate to the public login page. Keep the public build link for hosted access.
