# Repository Guidelines

## Project description
The repository hosts a tempo training webpage implemented in TypeScript. The webpage is intended to help musicians improve their sense of timing and rhythm through interactive exercises and feedback. The general structure is a page with a metronome, a set of tempo exercises (for example, straight 8th notes, drum rudiments, etc), and a staff showing the selected tempo pattern; feedback is given to the user via analysis of their audio input, which is visualized on the staff during playback.  Each note in the pattern is highlighted as it is played, and the user can see how closely their input matches the expected timing.

## Project Structure & Module Organization
Keep all runtime code inside `src/`. Place automated specs in `tests/`, mirroring the `src/` layout, and stash exploratory spikes in `spikes/` (do not ship them). Store static tone or metronome samples in `assets/`. Configuration files—`package.json`, `tsconfig.json`, `vitest.config.ts`—stay in the repository root; update this guide if new folders become canonical.

## Build, Test, and Development Commands
Run `npm install` once after cloning to install dependencies. Use `npm run dev` for the hot-reloading playground when iterating on timing algorithms or UI interactions. Production bundles come from `npm run build`. Validate correctness with `npm run test`, and lint before pushing via `npm run lint`. If you add new tooling, expose it through an npm script so every contributor shares the same entrypoints.

## Coding Style & Naming Conventions
We standardize on strict TypeScript, ES2022 modules, and 2-space indentation. Functions and variables use camelCase; exported classes and components use PascalCase. Keep files focused: one primary class or component per file, ideally under 200 lines. Format code with Prettier (`npm run lint -- --fix` runs formatting plus linting) and leave TODO markers as `// TODO(username): context`.

## Testing Guidelines
Vitest drives unit and integration coverage. Place spec files alongside code as `*.spec.ts`, mirroring directory names. Tests should capture tempo edge cases (subdivisions, swing ratios, high BPM). Aim for greater than 90% coverage on `src/time/` modules and document notable gaps in the PR description. Use `npm run test -- --watch` during development; end-to-end harnesses live under `tests/e2e/`.

## Commit & Pull Request Guidelines
Follow Conventional Commits (`feat: add swing subdivision planner`). Each PR must reference an issue or include a short motivation, list observable changes, and attach terminal output for `npm run test` and `npm run lint`. Include screenshots or GIFs whenever UI behavior changes. Request review once CI passes and label the PR with the impacted domain (`time`, `audio`, `ui`).
