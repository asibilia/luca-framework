---
"@alecsibilia/luca": patch
---

telemetry batch completion (9 todos in one PR)

Foundation features for the telemetry-v1 system, plus targeted bug fixes that
unblock cross-run aggregation.

- **#43 luca-telemetry-report aggregator skill** — read-only cross-run
  aggregator over `.planning/telemetry/*.jsonl`. New skill at
  `skills/luca-telemetry-report/SKILL.md` with `existsSync` guard,
  forbidden-tools fence, 7 steps. Command shim at
  `commands/luca-telemetry-report.md`. Flags: `--runs N` (default 10),
  `--since <ISO>`, `--vault <name>`.

- **#44 telemetry janitor** — `reset-pipeline` best-effort archives the prior
  run's JSONL to `.planning/telemetry/archive/<runId>.jsonl` via
  `renameSync`. Wrapped in try/catch (sanitized warn on failure) so
  `reset-pipeline` always completes its state-mutation. New
  `TELEMETRY_ARCHIVE_DIR` / `TELEMETRY_ARCHIVE_PATH` exports in
  `phase-paths.ts`.

- **#45 record-recall action** — new `workflowState({ action: "record-recall",
  ... })` emits `recall.hit` / `recall.miss` telemetry with `verifiedCount`
  clamped against `resultCount`, `sanitizeLogMessage` on query for CWE-117,
  and `durationMs` routed through overrides. Allowlisted in 6 pipeline modes.
  Inline `// → record-recall { ... }` directive added to all 5 mode
  instruction files at every `muninn_recall` call site (9 directives total).

- **#46 review-iteration convergence telemetry** — `save-review-results`
  extended with optional `perspectives` array + severity counts + verdict.
  Emits `review.iteration` kind with `durationMs` computed from
  `state.reviewStartedAt`. New `reviewStartedAt` field set on switch-to-review
  (post-await merged write) and re-enter-pipeline; cleared on reset-pipeline.

- **#29 outcome enum** — `record-subagent` schema extended with
  `outcome: 'completed' | 'completed_no_usage' | 'completed_partial_parse' |
  'crashed' | 'killed' | 'timeout'` optional field. Stored in `meta.outcome`
  (v:1 contract preserved). Backward-compatible (missing → null in meta).
  `shared-prefix.ts` usage comment example mentions the new field.

- **#11 correlationId format audit** — replaced legacy `<ts>` placeholder
  with `const ts = Date.now()` + `` `${ts}` `` template across spawn-site
  directives in `execute.md` / `architect.md` / `research.md` / `finalize.md`.
  New region-scoped test `correlationid-format-prose.test.ts` enforces the
  positive form and negative-asserts `<ts>` + compact-ISO 14-digit + 10+
  digit hardcoded epoch.

- **#17 finalize.md vault hardcode** — confirmed clean (no `vault: "default"`
  literal remains; doc-comment fallback semantics preserved at L52).

- **#18 reviewer-dx/simpl usage self-report drift** — drive-by regression
  test added to `subagent-telemetry-prose.test.ts` enforcing that
  `reviewer.ts`'s terminal usage instruction is the LAST occurrence of
  `Append the usage comment` in the assembled prompt and that no `## `
  heading follows. Anchors the dx + simpl perspectives that originally
  exhibited attention-burial drift in PR #245.

- **#10 absorb into #43** — ts-gap fallback for `durationMs:null` on
  `*.end` records is now documented in the aggregator SKILL.md Step 3
  (Date.parse(end.ts) − Date.parse(start.ts) when finite & non-negative).

- **shadow-scanner allowlist** — `'telemetry/'` added to
  `planning_root_dirs` (prose + Zod default) so the archive subdir and
  report files don't trip the shadow scanner.

New tests: 28 added (8 record-recall + 4 review.iteration + 3 outcome + 4
janitor + 4 aggregator-skill-presence + 1 drive-by #18 reviewer +
12 correlationId region tests + 21 recall-prose region tests, where
`correlationId-format-prose.test.ts` and `recall-prose.test.ts` are net-new
files). 401/401 tests, `bun tsc` clean.
