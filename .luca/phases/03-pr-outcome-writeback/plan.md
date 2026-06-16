# Plan: Phase 3 — pr-outcome-writeback (REQ-15)

## Objective
Add a post-merge write-back capturing merged-vs-reverted, review rounds, and time-to-merge, queryable by the phase-1/2 telemetry-report KPI layer. This is the FIRST telemetry signal originating outside a live pipeline run (post-merge, no live run-id).

## Context
- Research HIGH-confidence (build on, do not re-derive): new kind `pr.outcome` on the open `TelemetryKind` union (schemas.ts line ~42); `v: z.literal(1)` line 74 — NO bump. `meta` is `z.record(string,unknown)` line 85 (free-form).
- Storage unblock: `RUN_ID_RE = /^[A-Za-z0-9_-]+$/` — literal `pr-outcomes` is a valid runId. `appendTelemetry({ctx:{runId:'pr-outcomes',...}, meta})` writes `.luca/telemetry/pr-outcomes.jsonl` with NO writer change. Report glob `find .luca/telemetry -maxdepth 1 -name '*.jsonl'` auto-discovers it. Origin context lives in `meta`, not the filename.
- Run→PR map (gate REDIRECT — scope ADD): finalize.ts creates PR via `gh pr create` (~line 338-353) and TODAY records PR URL only as free-text confidence entry (~line 351) — not queryable. finalize HAS live runId (state `sessionId`, schemas.ts:96) + `branchName`(112) + `issueNumber`(113) at that point. Add second OPEN-union kind `pr.created` (same no-`v`-bump as `pr.outcome`) emitted AT PR-CREATE with top-level `runId`=live originRun → lands in that run's `<runId>.jsonl`. Join: `pr.created`(runId=originRun, meta.prNumber) ⋈ `pr.outcome`(meta.prNumber, in pr-outcomes.jsonl) → post-merge outcome ↔ originating run cost/first-pass KPIs.
- Trigger (gate ACCEPT): `luca pr-outcome` explicit flags ONLY (prNumber/result/reviewRounds/timeToMergeMs/branch?/issue?/originRunId?) — deterministic, fully unit-tested, NO `gh pr view` derivation on tested path.
- CLI shape (citty): tested unit is the write-surface handler; thin citty leaf wraps it. Precedent: `luca-confidence-log.ts` + `.test.ts`. `appendTelemetry`+`generateRunId` barrel-exported from `@alecsibilia/luca-core`.
- Report read-side: `defineSkill({body})` LLM-executed; per-kind explicit accumulation. Add Step 3 accumulator bullet (after `signal.failure-dump`) + Step 4 "PR Outcomes" section (after "Cost per Outcome"). Token-presence acceptance (phase-2 pattern).
- TWO confidence-gate `ask` items logged (storage/correlation model; trigger input model) — must resolve before execute.

## Phases

### Phase 1: pr-outcome-writeback

#### Wave 1: CLI write path (tracer bullet — schema kind + handler + real test + citty leaf)

- [x] **Task 1.1.1**: Add `'pr.outcome'` AND `'pr.created'` literals to the `TelemetryKind` union (near line 42, before `| (string & {})`) and an optional ADVISORY `.passthrough()` `PrOutcomeMetaSchema` (near line 184) — never wired to a throwing path. Both ride the open union; NO `v` bump.
  - Files: packages/luca-core/src/telemetry/schemas.ts
  - Verification: ac-01, ac-08, ac-10, anti-01

- [x] **Task 1.1.2**: New handler `luca-pr-outcome.ts` — Zod `inputSchema` (prNumber:number, result: `merged|reverted`, reviewRounds:number, timeToMergeMs:number, optional branch/issue/originRunId). Handler calls `appendTelemetry({cwd, kind:'pr.outcome', ctx:{runId:'pr-outcomes', phase/slug/wave/complexity/oversight:null}, meta:{prNumber,result,reviewRounds,timeToMergeMs,...optional}})`. Telemetry-only; does NOT touch `.luca/state.json`. Barrel-export it.
  - Files: packages/luca-cli/src/write-surface/handlers/luca-pr-outcome.ts, packages/luca-cli/src/write-surface/index.ts
  - Verification: ac-02, ac-09, anti-04
  - Dependencies: Task 1.1.1

- [x] **Task 1.1.3**: New real bun test `luca-pr-outcome.test.ts` (mirror confidence-log test: `mkdtemp`, invoke `tool.handler(payload,{cwd})`, read `.luca/telemetry/pr-outcomes.jsonl`). Assert: merged + reverted + reviewRounds + timeToMergeMs round-trip in the JSONL line; `inputSchema.safeParse` rejects bad `result` enum + missing required fields. Describe block named to contain `pr-outcome`.
  - Files: packages/luca-cli/src/write-surface/handlers/luca-pr-outcome.test.ts
  - Verification: ac-03, ac-04, anti-05
  - Dependencies: Task 1.1.2

- [x] **Task 1.1.4**: Thin citty leaf `pr-outcome` under `telemetryCommand.subCommands` (mirror confidence `logCommand`: flags → payload, `rejectUnknownFlags`, `runWriteHandler`). Register the handler. NOTE (G-DX-002): import `runWriteHandler`/`rejectUnknownFlags` from `commands/write-surface/__helpers/run-handler.ts` (cross-directory), NOT from `commands/telemetry.ts`.
  - Files: packages/luca-cli/src/commands/telemetry.ts
  - Verification: ac-05, ac-09
  - Dependencies: Task 1.1.2

- [x] **Task 1.1.5**: finalize.ts (`defineAgent`/mode body, LLM-executed — token-presence acceptance). Add directive at the PR-create step: after `gh pr create`, emit `luca telemetry emit --kind pr.created --run-id <sessionId> --meta '{"prNumber":<#>,"branch":"...","issue":<#>,"originRunId":"<sessionId>"}'` (consistent with finalize's existing CLI telemetry emits) → durable run→PR map in the live run's `<runId>.jsonl`.
  - Files: packages/luca-tools/src/artifacts/modes/finalize.ts
  - Verification: ac-11, ac-09, anti-03
  - Dependencies: Task 1.1.1

#### Wave 2: Report read-side (depends on Wave 1 kind name being fixed)

- [x] **Task 1.2.1**: Add Step 3 accumulator bullet for `pr.outcome` (after the `signal.failure-dump` bullet) and a Step 4 "### PR Outcomes" section (after "### Cost per Outcome") — merge rate, avg review-rounds, median time-to-merge, correlate to phase-2 first-pass KPI. Note `pr-outcomes.jsonl` is NOT a pipeline run (no duration/phase math). Teach (token-presence) that `pr.created` records are the run→PR join key: `pr.created`(meta.prNumber, runId=originRun) ⋈ `pr.outcome`(meta.prNumber) → merge outcome back to originating run's cost/first-pass (aggregate now; per-run join enabled by this map).
  - Files: packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts
  - Verification: ac-06, ac-07, ac-12
  - Dependencies: Task 1.1.1

- [x] **Task 1.2.2**: Add token-presence assertions in a separately-named `describe('pr-outcomes', ...)` block in `index.test.ts` (extend existing phase-2 file): assert body contains `pr.outcome`, `pr.created`, `### PR Outcomes`, `merge rate`/`time-to-merge`.
  - Files: packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.test.ts
  - Verification: ac-07, ac-12, anti-05
  - Dependencies: Task 1.2.1

## Deliverables
- **D1**: merged-vs-reverted captured → ac-02, ac-03
- **D2**: review-rounds captured → ac-03
- **D3**: time-to-merge captured → ac-03
- **D4**: queryable by report KPI layer → ac-06, ac-07
- **D5**: gates pass — handler test plus tsc → ac-04, ac-09
- **D6**: run→PR map persist (per-run correlation enablement) → ac-10, ac-11, ac-12

## Verification Criteria
- **ac-01**: `grep -nF "'pr.outcome'" packages/luca-core/src/telemetry/schemas.ts` returns ≥1 match (kind literal on the union).
- **ac-02**: `grep -nF "appendTelemetry" packages/luca-cli/src/write-surface/handlers/luca-pr-outcome.ts` returns ≥1 match (handler emits via appendTelemetry).
- **ac-03**: `timeout 120 bun test packages/luca-cli/src/write-surface/handlers/luca-pr-outcome.test.ts` exits 0 (merged + reverted + reviewRounds + timeToMergeMs round-trip in the JSONL line).
- **ac-04**: `timeout 120 bun test packages/luca-cli/src/write-surface/handlers/luca-pr-outcome.test.ts` exits 0 — the schema-rejection test (`inputSchema.safeParse` rejects a bad `result` enum) passes inside the named `pr-outcome` block (whole-file run, no `-t`).
- **ac-05**: `grep -nF "'pr-outcome'" packages/luca-cli/src/commands/telemetry.ts` returns ≥1 match (citty leaf registered under telemetry subCommands).
- **ac-06**: `grep -nF "pr.outcome" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` returns ≥1 match (Step 3 accumulator directive).
- **ac-07**: `grep -nF "### PR Outcomes" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` returns ≥1 match (Step 4 report section heading).
- **ac-08**: `grep -nF "lucaPrOutcomeTool" packages/luca-cli/src/write-surface/index.ts` returns ≥1 match (handler barrel-exported).
- **ac-09**: `bunx --bun tsc --noEmit` exits 0 (whole-repo type gate).
- **ac-10**: `grep -nF "'pr.created'" packages/luca-core/src/telemetry/schemas.ts` returns ≥1 match (second kind literal on the open union).
- **ac-11**: `grep -nF "pr.created" packages/luca-tools/src/artifacts/modes/finalize.ts` returns ≥1 match (finalize PR-create emits the run→PR map directive).
- **ac-12**: `grep -nF "pr.created" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` returns ≥1 match (report BODY names `pr.created` as run→PR join key).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT bump telemetry schema version — `grep -nE "^\s*v:\s*2\b" packages/luca-core/src/telemetry/schemas.ts` returns no match (line-anchored; excludes any `*`-prefixed doc-comment `v: 2`).
- **anti-02**: MUST NOT call `muninn_feedback` — `grep -rnF "muninn_feedback" packages/luca-core/src/telemetry/schemas.ts packages/luca-cli/src/write-surface/handlers/luca-pr-outcome.ts packages/luca-cli/src/commands/telemetry.ts` returns no match.
- **anti-03**: MUST NOT edit luca-mastracode `.md` — `git diff --name-only HEAD` lists no path under `packages/luca-mastracode/` ending in `.md`.
- **anti-04**: MUST NOT mutate `.luca/state.json` from the handler (telemetry-only append) — `grep -nF "state.json" packages/luca-cli/src/write-surface/handlers/luca-pr-outcome.ts` returns no match.
- **anti-05**: MUST NOT run `bun test -t <pattern>` against unnamed blocks (guard G-DX-003) — `grep -nE "bun test .* -t " .luca/phases/03-pr-outcome-writeback/plan.md` returns no match. Both test files name their describe blocks (`pr-outcome` / `pr-outcomes`); ac-03/ac-04 use whole-file `bun test <path>`.

## Risks & Mitigations
- **First signal outside a live run** (ask-1): fixed `pr-outcomes.jsonl` synthetic-runId log; report must NOT treat it as a pipeline run for duration/phase math (directive in Task 1.2.1). Open `ask` — resolve at gate.
- **Trigger input model** (ask-2): explicit flags only (deterministic, no gh coupling). Open `ask` — resolve at gate.
- **Unknown-kinds drift**: without Task 1.2.1, `pr.outcome` lands in the report "Unknown kinds" tally; Wave 2 closes this (ac-06).
- **Schema-grammar load-bearing**: `v` bump guard is line-anchored to dodge doc-comment false positives (anti-01).

## Decisions
- 2026-06-16 — Single new kind `pr.outcome`; merged-vs-reverted carried in `meta.result`, not two kinds.
- 2026-06-16 — Fixed `pr-outcomes.jsonl` synthetic-runId storage; origin context in `meta` (no per-run join) — `ask` item, gate-routed.
- 2026-06-16 — CLI-verb trigger (`luca telemetry pr-outcome`), run post-merge by user/CI; no daemon, finalize can't observe merge.
- 2026-06-16 — Explicit flags only as the tested path; no `gh pr view` auto-derivation — `ask` item, gate-routed.
- 2026-06-16 — Mirror `luca-confidence-log` handler+test+citty-leaf convention exactly; verb nested under `telemetry` (pr.outcome IS a telemetry record).
- 2026-06-16 — GATE RESOLVED: storage = fixed `pr-outcomes.jsonl` (post-merge `pr.outcome`) PLUS run→PR map via new `pr.created` kind emitted at PR-create (per-run join enabled, scope ADD — REDIRECT). Trigger = explicit flags only (ACCEPT, no gh derivation). Both kinds ride open union, no `v` bump.
- 2026-06-16 — Carried low-priority cleanup (5-item luca-telemetry-report LOW-advisory bundle + phase-1 record-recall.test.ts hardening) explicitly OUT of scope.
