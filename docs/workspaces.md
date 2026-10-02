# Development workspaces

The workspace kit provides Google-protected hosting, per-worktree Vite servers,
branch links and agent skills. Project-specific values live in
`workspace.config.json`. Shared code lives in `src/platform/` (Node) and
`src/workspace/` (optional browser integration). It has no dependency on the
music app, Atlas, PostgreSQL, Tailscale or a particular agent harness.

## Start a session

```sh
npm run workspace -- new improve-tuner
# Continue in the printed worktree. For an existing feature branch:
npm run workspace -- start
npm run workspace -- status
npm run workspace -- list
npm run workspace -- restart
npm run workspace -- stop
```

`new` fetches the configured base branch, creates `dev/<name>` in `.worktrees/`,
installs dependencies and starts the dev server. The base must already contain
the kit. Uncommitted changes in the calling checkout are left there; they are
not copied. `start` reuses the current feature branch and refuses the base
branch or detached HEAD. Each worktree receives a unique ID and a free loopback
port. Vite handles hot reload; restart after changing startup configuration.

State and logs live in ignored `.dev-workspace/`. A registry in the shared Git
directory lets the gateway discover all worktrees. A detached supervisor owns
each server and accepts authenticated health/stop requests on loopback. Stop
does not signal a PID from a stale state file. It preserves the worktree,
branch and browser data. Processes stop at host reboot; run `start` again.

The printed build link is `{origin}/dev/use/{id}`. Google sign-in returns to the
chosen build at `/dev/build/{id}/`. `/dev/` lists running builds and production.
Build selection is in the URL, so separate tabs can use different builds.
A stopped build reports that it stopped instead of silently serving production.
The local URL works without Google through a localhost SSH forward. Microphone
access requires HTTPS or localhost. The public gateway must be deployed before
the public build links work; `start` does not deploy it.

## Google sign-in and the public gateway

Copy `.env.example` to `.env`, set permissions to `0600`, and configure:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: a Google web OAuth client.
- `GOOGLE_ALLOWED_EMAILS`: comma-separated verified accounts allowed into the app.
- `DEV_ALLOWED_EMAILS`: the subset allowed to browse and use dev builds.

Empty allowlists deny access. Register **exactly**
`{origin}/auth/google/callback` in the client's authorized redirect URIs.
An existing client may serve multiple projects, but Google consent branding
belongs to that client/project. All apps still keep separate local credentials,
allowlists, cookie names and session stores. The callback is derived from the
configured origin, never an incoming forwarding header. See
[Google's OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect#settingup).

```sh
npm ci
npm run build
npm start
```

The gateway binds `127.0.0.1:<port>`. Put an HTTPS reverse proxy or Cloudflare
tunnel in front of it, forwarding WebSocket upgrades. Do not expose the Vite
ports. The app and assets require sign-in; `/health` is public. Only developers
can reach build listings, proxied HTTP and HMR sockets. The gateway strips
session/authorization headers before forwarding to Vite. It stores no Google
access or refresh tokens. Browser sessions use opaque random cookies, hashed
IDs persisted in the Git directory with private permissions, a seven-day expiry,
and same-origin CSRF checks for sign-out. OAuth uses state, PKCE, nonce and ID
token validation through `openid-client`. Pending logins expire after ten
minutes and are lost on restart. Run one gateway process per repository.

The example systemd unit under `deploy/` can supervise a stable production
checkout. Adjust its paths for the project and host before installation.
Starting or stopping the public service, repointing DNS/tunnel ingress, and
deploying are separate operations requiring the user's authorization.

### Production service on `om`

The gateway runs as the systemd **user** unit `practice-room.service`, installed
from `deploy/practice-room.service.example`. It is enabled and the user has
linger enabled, so it starts at boot without a login and restarts on any exit.
On `om`, `ExecStart` uses mise's major-version path
(`~/.local/share/mise/installs/node/26/bin/node`) because there is no
`/usr/bin/node`. Cloudflare Tunnel (`cloudflared.service`, token-managed)
already routes `practice.loomen.net` to `127.0.0.1:8200`.

```sh
systemctl --user status practice-room
journalctl --user -u practice-room -f
curl -s https://practice.loomen.net/health   # {"app":"practice-room","status":"ok"}
```

The service serves `dist/` from the checkout in its `WorkingDirectory`, so
switching branches there changes production. To deploy: update that checkout to
`main`, run `npm ci && npm run build`, and `systemctl --user restart
practice-room` if server code under `src/platform/` changed. Dev workspaces are
separate processes and do not survive a reboot.

## Browser integration and local data

Before rendering an app, call `initializeWorkspace()` from
`src/workspace/client.ts`. It loads the hosted account context and supports
plain Vite/preview without credentials. `getWorkspaceSession()` exposes the
display name, developer access and sign-out CSRF value. `signOut()` ends the
gateway session. Developers can link to `/dev/` from their account controls.

Use `storageNamespace(originalName)` for **both** localStorage prefixes and
IndexedDB database names. It separates hosted accounts and dev builds while
retaining existing keys in ordinary local development. Build URLs alone do not
isolate origin-wide browser storage. This is logical data separation for a
local-first prototype, not encryption or protection from a person who can
inspect that browser profile. Sign-out retains local data; Google sign-in does
not sync it. Existing local/production records are not silently copied into a
new account or build. Export any history needed before switching environments.

## Agent workflow and pull requests

Use the repo-local `workspace`, `link`, `rebase`, `rebuild` and `wrapup` skills.
Keep one descriptive branch/worktree per task, reuse it during the session,
and share a verified dev link promptly. Preserve local changes when rebasing.
Before a PR, update affected docs and run `npm run check`; this command belongs
to the host project and should include its appropriate checks. Register PRs
with the active harness when its linking tool is available. Creating a PR does
not authorize merge, deployment or workspace removal. After merge and closure
authorization, stop the workspace and remove only its clean, merged worktree.

## Adopt the kit in another app

From a repository containing this kit, point at an existing ESM Vite project:
Use Node 22.12 or newer for both development and the gateway.

```sh
npm run workspace:adopt -- --target ../new-app --name "New App" --slug new-app --origin https://new-app.example --port 8300
# Review the proposed file list, then repeat with --write.
```

The command copies only the kit, browser helper, workspace documentation and
five skills. It writes project configuration, an empty `.env.example` and a
project-specific example service unit under `deploy/`, merges
npm dependencies/scripts, wraps the existing Vite config with the workspace
adapter, and appends Git ignores and agent instructions. It refuses to overwrite
existing managed files or conflicting commands. It preserves an existing
`check` script, or assembles one from available lint/test/build commands. Runtime
ports and the public origin are supplied explicitly; choose non-overlapping
port ranges for apps on the same host (gateway, then up to 100 dev ports).

After adoption, run `npm install` in the target to update its own lockfile,
integrate the optional account/storage helper, configure its ignored `.env`,
register its Google callback and verify the app. No credentials, user data,
build outputs or installed production service configuration are copied. Review
the generated service unit before installing it. Commit the kit
to the target before creating worktrees from its base branch.

The initial adapter supports static Vite apps. Other frameworks can reuse the
branch/registry/auth design but need an equivalent base-path and private
readiness adapter; server-rendered production apps need an upstream adapter.
Database cloning is deliberately not included. Add an explicit project-specific
adapter when an app has a database, with an isolated target and lifecycle tests.

The maintained kit and personal `bootstrap-app` skill live in the private
[dbjohnson/agent-skills](https://github.com/dbjohnson/agent-skills) repository.
Each adopting app receives its own copy and a `workspace-kit.json` file recording
the source and release version. There is no sibling-checkout dependency at
runtime. Shared fixes belong upstream first; compare releases and apply reviewed
updates to each app, preserving its configuration and local changes. Pulling the
skill repository does not update or deploy adopting apps, and rerunning adoption
never blindly overwrites existing files.
