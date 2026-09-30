# Prototype verification — September 30, 2026

## Automated checks

- `npm run lint` and TypeScript checks pass.
- 71 Vitest cases across fourteen files cover musical input parsing, import handling, generated score completeness/shuffle notation, guitar/bass pitch estimation, delayed pitch at attacks, note matching, confidence filtering, milestones, and timing bounds/subdivisions. Instrument setup adds device filtering, access errors, exact device constraints, channel routing, cancellation/resource cleanup, input levels/clipping, tuner cents/reference calculations and stable pitch filtering. Controlled-clock React hook tests add recording lifecycle and device-removal coverage.
- The timing module has 100% statement/branch/function/line coverage. Coverage thresholds enforce at least 90% for that module. Coverage reporting intentionally targets the pure music/audio/domain functions rather than presenting whole-app coverage.
- `npm run build` produces the static app, module workers/worklet, fonts and SoundFont. A separately served production build was opened and its notation, sampled player initialization, advancing playback status and cursor were checked.
- `git diff --check` passes. The old deployment workflow was replaced with verification-only CI; hosted run results are available in the repository's Actions tab.

## Browser checks performed

Used T3 Code's collaborative browser against the development server and production preview.

- All three concepts switch inside the shared room. The piece, part, tempo and passage state stay shared.
- Trail transition activity sets its smaller passage, slower tempo and click; self-marking updates the activity count.
- Pocket's Strip it back mutes all accompaniment and enables the click.
- `shuffle beat ii-V-I in A at 104 BPM` resolves to Bm7/E7/Amaj7. Saving creates a playable four-part arrangement and a persistent library item.
- Editing both practice tempo and jam tempo commits the entered values without premature clamping.
- A one-bar loop at 240 BPM completed more than 20 cycles. Cursor tick evidence stayed inside the selected bar apart from the player's small callback overshoot at the boundary. Reapplying the range after a score load fixed an earlier stale synth range.
- Score and tab rendered through real alphaTab SVG output. Imported long scores scroll inside the score panel; transport is outside that scroll area.
- Example feedback is labelled, provides no save button, and does not alter take history.
- A mocked permission denial displays a recoverable microphone error. No physical microphone was activated during automated verification.
- A browser-generated MediaStream with a four-note sine sequence exercised the actual input analyser, pitch/onset detector, timeline matcher, take review and save path. Final result: four of four notes matched, 100% coverage, approximately 20 ms median timing distance. This is a synthetic wiring check, not evidence of real instrument accuracy.
- The count-in no longer enters the take duration: the one-bar 72 BPM test recorded approximately 3.34 seconds, excluding its preceding count-in.
- Early attack frames with insufficient periodic audio originally consumed the note. The onset tracker now preserves the attack timestamp while waiting briefly for pitch confidence. Unit tests cover that regression.
- Saved results appear in progress and earn the first milestone. Clearing history through its confirmation resets the empty state and milestones. Synthetic results were removed after testing.
- Local library entries survive reload. Imported file bytes are stored in IndexedDB.
- Library, jam, progress and review were checked at 390 × 844 CSS pixels; the document width remained 390 pixels, with deliberate internal scrolling for notation/tables. Desktop checks used 1280 and 1440 pixel widths.

## Supplied scores

These files were read from the original local repository for compatibility tests. Temporary public test copies were removed before the production build. They are not bundled in the app.

| File | Tracks | Measures | Initial BPM | Result |
|---|---:|---:|---:|---|
| Born-under-a-bad-sign - Albert-King.gp4 | 6 | 84 | 90 | Imported, rendered, sampled player ready |
| Eagles (The) - Hotel California.gp4 | 10 | 121 | 74 | Imported/rendered; alphaTab reports custom-bend fallbacks |
| Solo 3 - Comfort Food.gp | 1 | 53 | 88 | GP8 imported/rendered; embedded recording detected and surfaced as a limitation |

## Instrument setup and tuner

- The dedicated Instrument & tuner view replaces the microphone dialog. Device discovery requests browser audio permission only after a click. Temporary permission tracks are stopped; the subsequent connection uses the exact selected device.
- Browser-generated stereo audio exercised the live analyser and channel selector: input 1 showed A4 at 0 cents; input 2 showed bass E1 at +20 cents. Selecting a fixed E1 target and changing the test signal to concert pitch showed In tune.
- Raising the generated signal above the clipping threshold lit the clip indicator and cleared the tuner needle. Silence cleared the frequency and level. A simulated track-ended event disconnected the input and displayed recovery guidance.
- Denied permission showed an actionable error. The capture graph has no connection to the output. Automated checks cover cancellation and failure cleanup as well as rejecting unavailable channels.
- Guitar/drop-D and four/five-string bass presets, chromatic mode, fixed string targets and reference pitch selection are available. Low B0 through high guitar notes are tested at 44.1 and 48 kHz.
- Browser mocks and test streams were removed after validation. No physical interface was activated. These are synthetic wiring and accuracy checks; they do not establish real instrument or driver compatibility.
- Screenshot capture now works in the collaborative browser. The new setup view was visually inspected on desktop and at a 390-pixel mobile width; the additional navigation item scrolls inside its row.

## Remaining validation

- Human usability review is still needed. Earlier concept checks relied on DOM, interaction, layout and SVG inspection when screenshot capture was unavailable; the new setup view has also been inspected in screenshots.
- Test physical DI guitar, DI bass and acoustic microphone recordings; assess latency, pitch precision/recall, repeated attacks, bleed and distortion. The present numbers are uncalibrated and provisional.
- Test Firefox/Safari and physical mobile browsers; resizing Chromium verifies layout, not device-specific audio support.
- Add deterministic player-event alignment and import-race integration tests. Take/input hooks now cover count-in, stop/restart, device removal/reconnection and cleanup, using a real generated MIDI timeline with simulated player callbacks and capture resources. Current browser checks are recorded manual automation, not a committed end-to-end suite.
- Repeats, variable tempo, overlapping voices and expressive techniques require a richer assessment timeline. Sampled playback supports more notation than input grading.
- Review accessibility with assistive technology, particularly score navigation and low-contrast secondary text.
- Audit production dependency/license obligations, compressed-file budgets, storage schema migrations and sample-bank loading before deployment.

## Repository cleanup and recording reliability follow-up

- Removed personal `.vscode` settings, unused trainer drum samples and the unused `swingOffset` helper/test. Playback still uses alphaTab's SoundFont and shuffle notation. Moved the active Prettier settings into `package.json`, preserving formatting while removing the standalone config.
- Removed 29 generated PNG previews (about 5 MB). Design PDFs, generation/validation source and research remain tracked; `validate.py` regenerates previews, which are now ignored.
- Reproduced and fixed dropped opening attacks when input arrives before the first playback-position callback. Observations retain absolute timestamps until review; only events within the established performance window are assessed. Delayed count-in attacks are excluded.
- Duplicate record requests no longer replace an active capture. Stopping in the count-in yields an empty, interrupted review; restarting gets fresh evidence and a fresh clock. Review remains separate from explicit saving, and repeated saves do not duplicate history.
- Reproduced and fixed input removal while `AudioContext.resume()` is pending. The stream and context are released instead of reporting a disconnected input as ready. Hook integration checks also cover disconnects during count-in/playback, reconnecting, navigation and unmount cleanup.
- The added tests run in React Strict Mode with an isolated browser storage implementation. They verify lifecycle wiring and deterministic callback timing, not physical-device latency or real instrument accuracy. Tests, coverage, lint, formatting and the production build pass on `om`; the collaborative browser was unavailable for this follow-up, so earlier browser checks above were not repeated.
