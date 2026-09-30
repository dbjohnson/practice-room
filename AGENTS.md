# Repository Guidelines

## Project description
Practice Room (`dbjohnson/practice-room`) is a React and TypeScript web app for guitar and bass practice. Phrase, Trail and Pocket share notation, sampled playback, imports, jams, audio-interface input, tuning, feedback and local progress. It is a local-first prototype; performance assessment is experimental. The original tempo-trainer runtime has been replaced. Product plans and mockups are preserved in `spikes/`.

## Handoff
For the move to server `om`, clone or pull `main` from `dbjohnson/practice-room`, then read `README.md` and `spikes/prototype-verification.md` before continuing. Continue all three concepts with common components, prioritizing guitar/bass, feedback and practice progress. The latest completed feature is Instrument & tuner; physical-interface validation remains outstanding.

## Project Structure & Module Organization
Keep all runtime code inside `src/`. Place automated specs in `tests/`, mirroring the `src/` layout, and stash exploratory spikes in `spikes/` (do not ship them). Store static tone or metronome samples in `assets/`. Configuration files—`package.json`, `tsconfig.json`, `vitest.config.ts`—stay in the repository root; update this guide if new folders become canonical. `src/app/` coordinates shared state, `src/music/` handles score models and jams, `src/audio/` handles playback and analysis, `src/domain/` defines shared types and progress rules, `src/components/` holds reusable controls, `src/pages/` composes screens, and `src/storage/` owns browser persistence. `public/` contains the favicon and generated alphaTab font/soundfont assets; do not commit the generated copies.

## Build, Test, and Development Commands
Run `npm install` once after cloning to install dependencies. Use `npm run dev` for the hot-reloading playground when iterating on timing algorithms or UI interactions. Production bundles come from `npm run build`. Validate correctness with `npm run test`, and lint before pushing via `npm run lint`. If you add new tooling, expose it through an npm script so every contributor shares the same entrypoints.

## Coding Style & Naming Conventions
We standardize on strict TypeScript, ES2022 modules, and 2-space indentation. Functions and variables use camelCase; exported classes and components use PascalCase. Keep files focused: one primary class or component per file, ideally under 200 lines. Format code with Prettier (`npm run format` formats files; `npm run lint` checks ESLint) and leave TODO markers as `// TODO(username): context`.

## Testing Guidelines
Vitest drives unit and integration coverage. Place `*.spec.ts` files in `tests/`, mirroring the `src/` directory names. Tests should capture tempo edge cases (subdivisions, swing ratios, high BPM). Aim for greater than 90% coverage on `src/time/` modules and document notable gaps in the PR description. Use `npm run test -- --watch` during development; end-to-end harnesses live under `tests/e2e/`.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat: add swing subdivision planner`). Each PR must reference an issue or include a short motivation, list observable changes, and attach terminal output for `npm run test` and `npm run lint`. Include screenshots or GIFs whenever UI behavior changes. Request review once CI passes and label the PR with the impacted domain (`time`, `audio`, `ui`).
