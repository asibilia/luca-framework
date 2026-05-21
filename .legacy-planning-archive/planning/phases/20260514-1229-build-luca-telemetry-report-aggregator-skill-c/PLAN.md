# Plan: Telemetry Batch Completion

## Objective

Ship 9 telemetry todos in one PR: aggregator skill (#43), janitor (#44), record-recall (#45), review-iteration (#46), outcome enum (#29), correlationId audit (#11), finalize vault doc fix (#17), reviewer drift verify (#18), and absorb #10 into #43.

## Context

CWD: `packages/luca-mastracode/`. Branch: `feat/telemetry-batch-completion` off main (verify pre-flight: `git rev-parse --abbrev-ref HEAD`). TelemetryRecord v:1 LOCKED — all schema additions go in `meta`. `record-recall` absent from all 6 modes; `reviewStartedAt` absent from schema. `#18` already closed by PR #247; add drive-by regression test. `#10` re-scoped into aggregator (ts-gap fallback). Test pattern reminder: `import * as fs from 'node:fs'` + `spyOn(fs, ...)` — named-import spy is ESM-ineffective.

## Phases

### Phase 1: Telemetry Batch Completion

#### Wave 1: Foundation (schemas + state + telemetry kinds) — parallel

- [ ] **Task 1.1.1 [AFK]**: Add `reviewStartedAt?: string` to `LucaWorkflowState` (luca-store.ts) and `lucaStateSchema` (state.ts) as optional ISO datetime.
  - Files: `src/state/luca-store.ts`, `src/state/state.ts`
  - Verification: `bun test luca-store.test.ts` passes; field appears in `readLucaState()` return shape.

- [ ] **Task 1.1.2 [AFK]**: Extend `TelemetryKind` union with `'recall.hit' | 'recall.miss' | 'review.iteration'` (string literals for IDE autocomplete; Zod schema accepts any string already).
  - Files: `src/state/telemetry.ts`
  - Verification: tsc clean; new literals visible to consumers.

- [ ] **Task 1.1.3 [AFK]**: Add `recordRecallAction` Zod schema to workflow-state.ts (mirror record-subagent: `query` `.min(1).max(512).regex(/^[^\r\n\t]+$/)`, `resultCount`/`verifiedCount` nonneg nullable, `vault`/`mode` `.max(64)` with regex, `durationMs` nullable). Add `'record-recall'` to `WORKFLOW_STATE_ACTIONS` array + flat input schema mirror.
  - Files: `src/tools/workflow-state.ts`
  - Verification: schema present; flat mirror has `.optional()` fields; switch case dispatches.

- [ ] **Task 1.1.4 [AFK]**: Implement `record-recall` switch case: dispatch `recall.hit` if `resultCount > 0` else `recall.miss`; clamp `verifiedCount = Math.min(verifiedCount ?? 0, resultCount ?? 0)`; emit with `durationMs` in overrides + `sanitizeLogMessage(query)` in return message. Store user-supplied `mode` field as `meta.callerMode` (avoid collision with phase-context mode resolved server-side).
  - Files: `src/tools/workflow-state.ts`
  - Verification: emits correct kind; returns `{success:true, ...}` on valid input; meta contains `callerMode` not `mode`.

- [ ] **Task 1.1.5 [AFK]**: Extend `recordSubagentAction` schema with `outcome: z.enum(['completed','completed_no_usage','completed_partial_parse','crashed','killed','timeout']).nullable().optional()`. Store in `meta.outcome` on emit (NOT top-level — v:1 contract). Update flat input schema mirror.
  - Files: `src/tools/workflow-state.ts`
  - Verification: schema accepts new field; existing records without outcome still validate.

- [ ] **Task 1.1.6 [AFK]**: Add `TELEMETRY_ARCHIVE_DIR()` returning `<TELEMETRY_DIR>/archive` and `TELEMETRY_ARCHIVE_PATH(runId)` calling `assertValidRunId` before constructing path.
  - Files: `src/util/phase-paths.ts`
  - Verification: traversal-guard test (invalid runId throws); valid path resolves under planningRoot.

- [ ] **Task 1.1.7 [AFK]**: Janitor: in `reset-pipeline` case, BEFORE clearing runId, best-effort `mkdirSync(archiveDir, {recursive:true})` + `renameSync(TELEMETRY_PATH(runId), TELEMETRY_ARCHIVE_PATH(runId))` wrapped in try/catch (never throws — `console.warn(sanitizeLogMessage(err))`).
  - Files: `src/tools/workflow-state.ts`
  - Verification: archives current JSONL on reset; no-throw on missing file; no-throw on EACCES.

- [ ] **Task 1.1.8 [AFK]**: Extend `save-review-results` schema with `perspectives: z.array(z.string().max(64).regex(/^[a-z0-9_-]+$/)).max(10).optional()`. Capture `priorIteration = state.reviewIteration ?? 0` BEFORE writeLucaState increment. Emit `review.iteration` kind with `meta: {verdict, mustFixCount, shouldFixCount, noteCount, iteration: priorIteration, perspectives: perspectives ?? null}` + `durationMs` in overrides via `finiteOrNull(Date.now() - Date.parse(state.reviewStartedAt))`.
  - Files: `src/tools/workflow-state.ts`
  - Verification: emits review.iteration; null durationMs when reviewStartedAt absent or malformed.

- [ ] **Task 1.1.9 [AFK]**: switch-mode: after successful await, if `targetMode === 'luca:5-review'`, write `reviewStartedAt: new Date().toISOString()` in the existing post-await merged writeLucaState (same write as currentModeStartedAt). reset-pipeline + re-enter-pipeline clear `reviewStartedAt: undefined`.
  - Files: `src/tools/workflow-state.ts`
  - Verification: field set on review entry; cleared on reset.

- [ ] **Task 1.1.10 [AFK]**: Allowlist `'record-recall'` in all 6 pipeline modes (triage, research, architect, execute, review, finalize) in tool-manifest.ts. Rationale: harmless if unused; capability symmetric with `record-subagent`. `outcome` is schema-level, no manifest change.
  - Files: `src/tools/tool-manifest.ts`
  - Verification: `bun test preferences-mode-coverage.test.ts` — snapshot includes `record-recall` for all 6 modes.

- [ ] **Task 1.1.11 [AFK]**: shadow-scanner allowlist — TWO files for symmetry. (a) `src/subagents/shadow-scanner.ts` L48 prose array currently lacks `telemetry/` — append `"telemetry/"` (covers archive + reports subdirs). (b) `src/state/shadow-scanner.ts` Zod schema `planning_root_dirs.default([...])` array (around L100) — append `'telemetry/'` so users with no `.planning/config.json` get the same default as the prose.
  - Files: `src/subagents/shadow-scanner.ts`, `src/state/shadow-scanner.ts`
  - Verification: `grep -n '"telemetry/"\|'\''telemetry/'\''' src/subagents/shadow-scanner.ts src/state/shadow-scanner.ts` returns matches in both files; `bun tsc` clean.

#### Wave 2: Prose updates (mode instructions + skill) — parallel

- [ ] **Task 1.2.1 [AFK]**: Add `record-recall` prose to 5 mode files immediately after each `muninn_recall` call. Format: `// → record-recall {query, resultCount, verifiedCount, vault, mode, durationMs}` inline directive (NOT fenced — PR #247 lesson). Cite line numbers from RESEARCH.md.
  - Files: `src/instructions/triage.md` (L70), `architect.md` (L99,L104), `execute.md` (L386,L437), `review.md` (L124), `finalize.md` (L75,L318,L337)
  - Verification: 9 `record-recall` directives present; each inline (not in code fence).

- [ ] **Task 1.2.2 [AFK]**: Audit correlationId format in execute.md / architect.md / research.md / finalize.md spawn-site directives. Each must use `const ts = Date.now()` + `${ts}` template. Fix any `<ts>` placeholder or compact-ISO.
  - Files: `src/instructions/execute.md`, `architect.md`, `research.md`, `finalize.md`
  - Verification: all spawn-site directives use `${ts}` form; no `<ts>` or compact-ISO `\d{14}` patterns.

- [ ] **Task 1.2.3 [AFK]**: finalize.md vault hardcode fix — replace `vault: "default"` literal at L244 with `vault: "<vault from .planning/config.json → muninn.vault, fallback \"default\">"`. L52 doc-comment already describes correct fallback semantics — DO NOT modify L52.
  - Files: `src/instructions/finalize.md`
  - Verification: `grep -n 'vault:\s*"default"' src/instructions/finalize.md` returns zero matches (excluding any example/illustration blocks).

- [ ] **Task 1.2.4 [AFK]**: review.md `save-review-results` call updated to pass `perspectives: ['architecture','security','simplification','dx']` array.
  - Files: `src/instructions/review.md`
  - Verification: review.md emits perspectives in save-review-results JSON example.

- [ ] **Task 1.2.5 [AFK]**: shared-prefix.ts usage instruction extended (optional): mention `outcome` field example in `<!-- usage -->` JSON. Keep <400 token budget.
  - Files: `src/subagents/shared-prefix.ts`
  - Verification: file size delta ≤200 chars; existing tests pass.

- [ ] **Task 1.2.6 [AFK]**: Create `skills/luca-telemetry-report/SKILL.md` mirroring memory-audit/SKILL.md structure. ~250 lines. Sections: YAML frontmatter, scope guard, forbidden-tools fence (workflowState + muninn_remember/forget/evolve/state/consolidate), arguments + pre-flight validation (--runs N default 10, --since `^\d{4}-\d{2}-\d{2}`, --vault `^[a-z0-9_-]+$`), 7 numbered steps (preflight → **existsSync(TELEMETRY_DIR()) guard → empty-report short-circuit if absent** → enumerate via `find` → stream-read → aggregate → durationMs fallback compute (orchestrator value > ts-gap fallback) → write report → summary), failure modes table.
  - Files: `packages/luca-mastracode/skills/luca-telemetry-report/SKILL.md`
  - Verification: file present; renders cleanly; forbidden-tools fence parseable; Step 2 explicitly mentions existsSync guard.

- [ ] **Task 1.2.7 [AFK]**: Create `commands/luca-telemetry-report.md` — 8-line shim activating skill, `$ARGUMENTS` token.
  - Files: `packages/luca-mastracode/commands/luca-telemetry-report.md`
  - Verification: command renders in slash-command picker.

#### Wave 3: Tests + changeset

- [ ] **Task 1.3.1 [AFK]**: Add 8 lettered sub-tests for `record-recall` to `workflow-state-actions.test.ts`: (a) hit emits recall.hit, (b) miss emits recall.miss, (c) verifiedCount clamped, (d) malformed query rejected with ActionValidationError, (e) CR/LF in query rejected (CWE-117), (f) durationMs in overrides not meta, (g) null resultCount → null verifiedCount, (h) vault regex enforced.
  - Files: `src/__tests__/workflow-state-actions.test.ts`
  - Verification: 8 new tests pass.

- [ ] **Task 1.3.2 [AFK]**: Add 4 lettered sub-tests for `review.iteration`: (a) emits with all meta fields, (b) priorIteration captured before increment, (c) perspectives propagate, (d) malformed reviewStartedAt → durationMs:null (NaN guard).
  - Files: `src/__tests__/workflow-state-actions.test.ts`
  - Verification: 4 new tests pass.

- [ ] **Task 1.3.3 [AFK]**: Add 3 lettered sub-tests for `outcome` enum: (a) valid outcome stored in meta, (b) missing outcome accepted (backward compat), (c) invalid outcome rejected.
  - Files: `src/__tests__/workflow-state-actions.test.ts`
  - Verification: 3 new tests pass.

- [ ] **Task 1.3.4 [AFK]**: Janitor tests: (a) archives JSONL on reset, (b) no-throw on missing file, (c) no-throw on EACCES (mock renameSync throw), (d) invalid runId rejected pre-rename.
  - Files: `src/__tests__/workflow-state-actions.test.ts` (reset-pipeline describe block)
  - Verification: 4 new tests pass.

- [ ] **Task 1.3.5 [AFK]**: NEW test file `correlationid-format-prose.test.ts`: PR #247-style scoped region tests for execute.md / architect.md / research.md / finalize.md — extract spawn-site region (between known headings), assert `const ts = Date.now()` present, negative-assert `<ts>` placeholder + `\d{10,}` hardcoded epoch + `\d{14}` compact-ISO. Strip `e.g. "..."` example clauses before negative scan.
  - Files: `src/__tests__/correlationid-format-prose.test.ts`
  - Verification: 4 region tests pass; negative-case (manually regress to `<ts>`) confirms test fails.

- [ ] **Task 1.3.6 [AFK]**: NEW test `recall-prose.test.ts`: 5 region tests (one per mode file) asserting `record-recall` directive present and NOT inside code fence (split on triple-backtick, filter odd indices).
  - Files: `src/__tests__/recall-prose.test.ts`
  - Verification: 5 region tests pass; fence-split assertion holds.

- [ ] **Task 1.3.7 [AFK]**: Drive-by `#18` regression test: assert reviewer.ts terminal usage instruction holds for BOTH reviewer-dx and reviewer-simpl invocation paths. Read SUBAGENT_SHARED_PREFIX + reviewer.ts, lastIndexOf('Append the usage comment'), assert no `\n## ` follows.
  - Files: `src/__tests__/subagent-telemetry-prose.test.ts` (extend existing)
  - Verification: positional test passes for both perspectives.

- [ ] **Task 1.3.8 [AFK]**: Aggregator skill smoke tests via filesystem: assert SKILL.md present, frontmatter parses, forbidden-tools fence present, command shim present. NO execution test (skill is human-invoked).
  - Files: `src/__tests__/aggregator-skill-presence.test.ts`
  - Verification: 4 presence checks pass.

- [ ] **Task 1.3.9 [AFK]**: Changeset: `.changeset/telemetry-batch-completion.md` with `"@alecsibilia/luca-mastracode": minor` (foundation features), imperative title + bullets enumerating 9 todos addressed.
  - Files: `.changeset/telemetry-batch-completion.md`
  - Verification: `bun run changeset status` shows pending change.

## Verification Criteria

- All tests green (target: prior +28 = ~370+ tests)
- `bun tsc` clean
- `bun run lint` clean
- Branch `feat/telemetry-batch-completion` off main, single commit per wave
- PR body cites all 9 todo IDs and explains #10 re-scope + #18 already-closed

## Risks & Mitigations

- **Schema corruption via write_file** — Use string_replace_lsp for existing files; only NEW files via write_file.
- **False-green prose tests** — Region-scoped + negative assertions on all 4 spawn-site files.
- **Backward compat for outcome** — Place in meta (v:1 safe); aggregator handles old/new.
- **Janitor crash** — Best-effort try/catch with sanitizeLogMessage; never throws.
- **TelemetryKind union** — additive only; do NOT remove existing literals.
