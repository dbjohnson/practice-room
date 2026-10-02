# Practice gym implementation plan

## Experience

A gym contains reusable exercises and ordered routines. It launches each set in the existing music workspace, keeping the score, input, mixer and effects shared. Exercises and results belong to the current browser/account; no new server or cloud service is required.

1. Browse starter exercises or create a scale, arpeggio, custom note sequence, or exercise from an uploaded/current score. Name it, choose an instrument, and save it to a personal library. Built-ins are editable through personal copies.
2. Configure pitch pattern, octave range and direction, then choose rhythm and articulation. Routine blocks additionally specify a tempo ladder, key movement, repetitions, rests and an optional score gate. Optional routine-level tempo/key outer loops run every block at each key, then repeat the key cycle at the next tempo; enabled dimensions override the corresponding block settings. Show a deterministic set preview before starting.
3. Save/reorder/duplicate routines. Start a routine or train one exercise. The current set opens in the full-width music view. Recording produces a scored take and records its result automatically. Review, retry, advance, skip, pause and resume remain explicit controls.
4. See time, consistency, score trends and comparable tempo records. Reward effort with time XP, consistency with streaks, and verified performance with mastery badges and personal-best celebrations.

## Data and boundaries

- Exercise definitions have stable IDs and revisions. Built-ins include all seven major-scale modes, the seven harmonic-minor and melodic-minor modes, pentatonics, blues, whole-tone/chromatic scales and common arpeggios. Octave range, direction and interval/group patterns are explicit settings.
- A score-derived exercise owns a serialized source snapshot in IndexedDB, so deleting or editing the original music does not invalidate the exercise. Part and bar selection determine the practice material.
- A routine is an ordered list of blocks referencing exercises. Starting it snapshots the exercise definitions and expands tempo/key/repetition transformations into a bounded queue. Each attempt stores the exact settings and a comparability key.
- Gym library, routine state, compact attempt history and activity history use the existing account/build storage namespace. Source snapshots and take audio use IndexedDB. Reload resumes the queue but never starts recording automatically.
- The existing Take retains note/timing evidence and audio. Gym results retain compact historical metrics independently of the recent-take list. Repeated callbacks and retries cannot duplicate credit for a take ID.
- Articulation changes affect notation and playback. Assessment continues to score notes and timing; it does not pretend to measure picking direction, tone or articulation technique.
- Score-derived material keeps its selected pitches and rhythms in the exercise score. Unsupported expressive notation and simultaneous notes remain outside monophonic assessment.

## Transformations

- Tempo: 30–240 BPM, start/end/step, include the final target exactly once.
- Key order: fixed, fifths, fourths or chromatic; one to twelve keys. Apply each tempo to the selected keys and repetitions in a documented order.
- Rhythms: original, quarters, eighths, sixteenths, triplets, dotted pairs, swung pairs and syncopated patterns.
- Articulation: even, staccato, legato, strong-beat accents, offbeat accents and alternate picking.
- Generated scores use explicit beat durations, rests, bar padding, suitable tuning/fingering and key signatures. Preserve exact pitches and provide standard notation when a requested range cannot fit TAB.

## Routine lifecycle

Draft → preview → ready → recording/practicing → scored review → rest/next set → completed.

A set can be retried or skipped. A score gate requires a complete, sufficiently clear take meeting the chosen note and timing targets; skipping never counts as passing. Pause/reload preserve position and results. Changing music outside the workout pauses it rather than crediting unrelated material. Editing exercise/routine definitions does not change an in-progress snapshot or historical benchmarks.

## Rewards

- Time XP counts active recorded or play-along gym practice, excluding listening, recording replay, rests and idle screens.
- Attempt XP recognizes real effort without awarding accuracy records for unclear input.
- Clean-speed records require complete takes with at least 95% notes and timing and 90% coverage. Compare the same exercise revision, key, rhythm, articulation and pitch pattern; tempo is the dimension being improved.
- Badges cover first exercise/take/routine, practice-time milestones, consistency streaks, exploring modes/keys, clean takes and faster clean personal bests. Examples, repeated saves and interrupted takes cannot earn performance badges.
- Display daily practice goal, XP/level, streak, locked/earned badge progress, score/tempo history and per-exercise records. No invented scores or fake leaderboard competitors.

## Implementation sequence

1. Domain types, scale/pattern catalog, note parser, music generation and transformation/queue functions.
2. Versioned persistence and exercise/routine CRUD with source snapshots.
3. Gym library and exercise/routine editors with previews.
4. Routine runner and recording integration, restoration and scored-result retention.
5. Rewards, trend views, progress filtering and review celebrations.
6. Unit/integration tests, desktop/mobile browser workflow, documentation and full checks.

## Acceptance checks

- Generated modes/keys/octaves contain the intended pitches; rhythms fill bars and MIDI/assessment pitches agree.
- Tempo/key cycles expand in the displayed order with no repeated endpoint or cumulative transposition.
- Save/reload/edit/duplicate/delete behave consistently; source deletion does not break exercises; invalid/corrupt imports are rejected.
- A two-exercise routine records, scores, rests, advances, resumes after reload and finishes; retries and skips are distinguishable.
- Saved-take replay restores the exercise snapshot/settings. Pauses, failures and unrelated navigation cannot advance a set accidentally.
- Time and rewards exclude listening/replay/idle, deduplicate take IDs, and compare only eligible attempts. Date handling covers local-day boundaries and streaks.
- URL restores the gym section. Controls work at desktop and phone widths, in both themes, without reducing the practice score to a dashboard panel.

## Delivery

All six implementation stages are implemented in the current dev workspace. The Gym is available from the navigation menu. Desktop/mobile browser verification covers creating and uploading exercises, transforming routines, playback/recording, automatic result retention, replay, progression, reload/resume and progress. Automated checks and remaining hardware-assessment boundaries are recorded in [prototype-verification.md](prototype-verification.md#practice-gym).
