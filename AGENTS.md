# Repository Guidelines

## Project description
Practice Room (`dbjohnson/practice-room`) is a React and TypeScript web app for guitar and bass practice. A single music view brings together notation, sampled playback, imports, jams, audio-interface input, tuning, feedback and local progress. The score gets the available space; navigation, mixer, passages and feedback are minimized by default. The Practice gym adds reusable exercises, transformations, saved routines and local progress/rewards through the same music workspace. It is a local-first prototype; performance assessment is experimental. The original tempo-trainer runtime has been replaced. Product plans and mockups are preserved in `spikes/`.

## Handoff
For the move to server `om`, clone or pull `main` from `dbjohnson/practice-room`, then read `README.md` and `spikes/prototype-verification.md` before continuing. Continue the single music workspace, prioritizing guitar/bass, readable notation, feedback and practice progress. The former Phrase/Trail/Pocket concepts have been removed at the owner’s request. Instrument & tuner and recording lifecycle fixes are implemented. The latest increment adds Google-protected hosting, dev workspaces and reusable setup; see `docs/workspaces.md`. The latest increment remembers practice settings, aligns notes in order, and adds MIDI instrument input and per-part MIDI output for external instrument plugins. Return to recording reliability next: player-event alignment, import races and physical-interface validation remain outstanding.

## Project Structure & Module Organization
Keep all runtime code inside `src/`. Place automated specs in `tests/`, mirroring the `src/` layout, and stash exploratory spikes in `spikes/` (do not ship them). Configuration files—`package.json`, `tsconfig.json`, `vitest.config.ts`—stay in the repository root; update this guide if new folders become canonical. `src/app/` coordinates shared state, `src/music/` handles score models and jams, `src/audio/` handles playback and analysis, `src/domain/` defines shared types and progress rules, `src/components/` holds reusable controls, `src/pages/` composes screens, `src/time/` contains timing utilities, and `src/storage/` owns browser persistence. `public/` contains the favicon and generated alphaTab font/soundfont assets; do not commit the generated copies. Design PDFs and their source are preserved in `spikes/`; generated previews and personal editor settings are ignored.

## Build, Test, and Development Commands
Run `npm install` once after cloning to install dependencies. Use `npm run dev` for the hot-reloading playground when iterating on timing algorithms or UI interactions. Production bundles come from `npm run build`. Validate correctness with `npm run test`, and lint before pushing via `npm run lint`. If you add new tooling, expose it through an npm script so every contributor shares the same entrypoints.

## Development Workspaces

Follow [workspace operations](docs/workspaces.md). Start a new task from `main` with `npm run workspace -- new <descriptive-name>` and continue in the printed worktree on its `dev/` branch. Reuse an existing session's feature branch with `npm run workspace -- start`. Give the user its verified build link promptly; report when the public gateway is unavailable. Use worktrees to isolate concurrent sessions. Do not copy `.env` or browser data into worktrees.

The repo-local `workspace`, `link`, `rebase`, `rebuild` and `wrapup` skills cover the shared lifecycle. Before preparing a PR, update affected docs and run `npm run check`. After merge and authorization to close the session, stop its workspace and remove only a clean, merged linked worktree. Do not start or stop the public gateway, deploy, or change DNS/tunnel routing without user authorization. Local dev servers are managed with `npm run workspace`.

`src/platform/` is the vendored server/workspace kit; `src/workspace/` is its browser helper. Its maintained source and personal `bootstrap-app` skill live in `dbjohnson/agent-skills`; `workspace-kit.json` records the adopted release. Make shared fixes upstream, then review and test updates here. `docs/` holds operating guides and `deploy/` holds reviewable service templates. Keep application runtime code in `src/`. The kit's app-specific configuration lives in `workspace.config.json`. To adopt it elsewhere, use `npm run workspace:adopt -- --help`; keep product logic out of the shared kit. Server credentials never use a `VITE_` prefix.

## Coding Style & Naming Conventions
We standardize on strict TypeScript, ES2022 modules, and 2-space indentation. Functions and variables use camelCase; exported classes and components use PascalCase. Keep files focused: one primary class or component per file, ideally under 200 lines. Format code with Prettier, configured in `package.json` (`npm run format` formats files; `npm run lint` checks ESLint), and leave TODO markers as `// TODO(username): context`.

## Testing Guidelines
Vitest drives unit and integration coverage. Place `*.spec.ts` files in `tests/`, mirroring the `src/` directory names. Tests should capture tempo edge cases (subdivisions, high BPM) and generated shuffle notation. Aim for greater than 90% coverage on `src/time/` modules and document notable gaps in the PR description. Use `npm run test:watch` during development. There is no committed end-to-end harness yet; browser verification is recorded in `spikes/prototype-verification.md`.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat: add swing subdivision planner`). Each PR must reference an issue or include a short motivation, list observable changes, and attach terminal output for `npm run test` and `npm run lint`. Include screenshots or GIFs whenever UI behavior changes. Request review once CI passes and label the PR with the impacted domain (`time`, `audio`, `ui`).
