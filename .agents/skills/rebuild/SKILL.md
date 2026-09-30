---
name: rebuild
description: Rebuild evidence and downstream oncology arcs, or iterate on extraction failures when tuning is requested.
---

Rebuild the full evidence pipeline, including downstream oncology arcs.

Follow the repository's [tuning workflow](../../../docs/evidence/tuning.md) for
baseline capture, diagnosis, retries and final verification. Use the existing dev
workspace and the canonical rebuild script with `--dev-workspace`. The default
re-extracts the retained corpus. Use `--refresh-sources` only when a fresh source
poll/FDA verification is requested or needed to initialize an empty corpus.

For a one-pass request, rebuild and reassess. When the user requests iterative
tuning, fix ovarian failures first, then pan-tumor, then lung; continue through a
complete passing extraction run. Every tuning loop must finish with a fresh
full-corpus extraction and assessment using the final code, prompts and model
configuration. Any subsequent repair or targeted retry requires another full
run; mixed-version successes or a downstream-only resume cannot close the loop.
Follow the tuning workflow's final-test requirements and preserve each assessment.
Investigate matching regressions, including semantic defects behind successful
job statuses.
Do not weaken validation or manually edit statuses to clear failures.

Scorecards are optional (D-023): the rebuild writes none unless asked. Pass
`--scorecard` when the user asks for one during development; never after a
deploy and production rebuild, where the wrapup skill offers one written outside
the repository (`uv run python -m src.evidence.scorecard --since STARTED_AT
--output DIR`) so `main` stays clean. Without a
scorecard, report the rebuild's outcome from its output: jobs by state,
attention reasons and cost. When a scorecard is written, the final message gives
its Markdown path and summarizes its delta against the previous scorecard:
attention and cost changes, expected settings that became reachable or
unreachable, and any rows marked non-comparable or not measured. Commit a
scorecard only when the user asks to keep it.

With `EVIDENCE_ASSUME_APPROVED` on (in dev workspaces and `--dev-workspace` rebuilds; off in production, D-061), patients see
suggested efficacy values, proposed trial links, safety sections and prognosis
outlines as if approved, each flagged `assumed`; nothing is recorded as a
reviewer's decision, and explicit negative decisions still win. The rebuild
then also drafts a prognosis outline for each situation that has none (a paid
hosted-model call, skipped without a configured model) and reports it under
`prognosis_outlines`. See the
[development assumption](../../../docs/evidence/efficacy.md#development-assumption).

The final rebuild refreshes prepared developer test-case reviews and oncology
arcs. Suggested facts remain unconfirmed unless the user explicitly requests
confirmation. The workflow's results are development evidence, not clinical
approval. Keep technical results in the work item; follow AGENTS.md's separate
consent requirements for QMS review documents.
