---
name: wrapup
description: Prepare a pull request to close a work session, then carry out authorized post-merge work and workspace cleanup.
---

First use the [rebase skill](../rebase/SKILL.md) to bring this session's development
worktree onto the latest `origin/main`, preserving local changes and resolving
conflicts. Complete the rebase and restoration before final PR verification.
Then prepare and open a PR using the shared
[PR preparation workflow](../../../README.md#pull-request-preparation), reusing
the completed rebase. Start the code phase while
completing deferred documentation, and run the docs phase after those edits.
Inspect both results before opening the PR. Reuse passing results whose inputs
remain applicable instead of repeating full suites after Markdown-only edits.

Reuse decisions already given in this session. 
Continue PR preparation while awaiting these optional choices. Unanswered choices do not
authorize production work and need not delay the PR. 

Keep the PR description concise: resulting behavior, verification, original
failures and remaining limitations. Wait for actual merge before any authorized
production work; opening a PR does not authorize merging it. Load the
[update](../update/SKILL.md) skill only when
those follow-ups are requested. Once the work is approved for close and the
authorized follow-ups are complete, run `uv run python -m src.dev_workspace stop`
in this worktree to stop its server and drop its clone. Remove the local worktree and/or branch.
