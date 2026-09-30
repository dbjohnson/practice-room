---
name: link
description: Provide a link to the dev environment
---

Provide the current dev build's link on the Atlas production site. It has the
form `{production}/dev/use/{schema}` (for example
`https://practive.loomen.net/dev/use/dev_my_branch`): production signs the
developer in with Google and forwards the browser to this worktree's dev
server, so it works from any network, without Tailscale.

Run `uv run python -m src.dev_workspace status` and give the `Build link:` URL
it prints. If the workspace is not running, start it
(`uv run python -m src.dev_workspace start`, or `restart` if it has stopped) and
give the `Build link:` URL that prints. Do not show the tailnet URLs, ports or
the "All dev workspaces" directory.
