# Plan: Phase 2 — cost-per-outcome-report (REQ-13)

## Objective
Add 3 cost-analytics directives to `luca-telemetry-report` BODY: (1) token×model-rate cost compute, (2) cost-per-outcome metrics, (3) structure-vs-executor token attribution. Guard with a real `index.test.ts`.

## Context
Skill is an **instruction body**, not runnable code: `defineSkill({body=BODY})` template-literal string the LLM reads + executes by hand. All 3 asks = prose directives added to BODY, NOT testable TS. Cost "compute" = directives telling LLM how. Single source file: `packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts`. New sibling test: `index.test.ts`. NO schema change, NO emit-site change, NO luca-mastracode .md edits.

Research-confirmed anchors (do not re-derive):
- `subagent.complete` meta carries `role`, `inputTokens`, `outputTokens`, `success`, `model`, `outcome` (`schemas.ts`; top-level `meta` = `z.record(string,unknown)`; `v: z.literal(1)` line 74 — NO bump).
- Ask-3 discriminator = `meta.role` (no `agentType`). Bucket: executor = `meta.role === "executor"`; structure = every other role (unknown/future → structure, conservative).
- No pricing table in `packages/`. Models drift (`-4-5/-4-6/-4-7`) → substring-match `opus`/`sonnet`/`haiku` + fallback rate + unknown-model flag. Rates = hardcoded markdown table in BODY, operator-editable defaults, "verify current pricing" caveat.
- BODY anchors: Step 3 `subagent.*` accumulator ~line 89; Step 4 "Subagent Costs" section ~lines 110-111. Phase 1 `recall.utilization` is additive precedent — follow, don't duplicate.
- `phases-completed` from `phase.end` (byPhase, line 87); first-pass-success from review.iteration / verify convergence (line 92).
- Test precedent = `modes/record-recall.test.ts`: `readFileSync` body, `expect(body).toContain(token)`, per-group `describe` blocks so partial drops fail loudly. Phase-1 ac-12 used weak grep-symbol; improve with real `index.test.ts`.

## Phases

### Phase 1: cost analytics

#### Wave 1: BODY directives (tracer — all 3 asks in prose)
- [ ] **Task 1.1.1**: Add operator-editable rate table + cost-compute directive. Insert a `### Model rate table` block (rows `opus`/`sonnet`/`haiku`, input + output $/token columns, fallback row + unknown-model flag, "verify against current pricing" caveat) and extend the Step 3 `subagent.*` accumulator (~line 89) to multiply `inputTokens`/`outputTokens` by substring-matched rates into per-call + per-role cost. Add Step 4 `### Cost Summary` heading after "Subagent Costs" (~line 111).
  - Files: `packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts`
  - Verification: ac-01, ac-02, ac-03
  - Dependencies: none

- [ ] **Task 1.1.2**: Add cost-per-outcome directive. New Step 4 `### Cost per Outcome` section computing cost / phases-completed (from `phase.end` byPhase) AND cost / first-pass-success, with first-pass-success defined literally (exactly one `review.iteration` ending APPROVED, verify passed, no fix re-entry).
  - Files: `packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts`
  - Verification: ac-04, ac-05
  - Dependencies: 1.1.1

- [ ] **Task 1.1.3**: Add structure-vs-executor attribution directive. Extend Step 3 accumulator to bucket tokens+cost by `meta.role` (executor bucket = `role === "executor"`; structure = all else); add Step 4 `### Structure vs Executor Attribution` section. Document the heuristic role mapping in prose.
  - Files: `packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts`
  - Verification: ac-06, ac-07
  - Dependencies: 1.1.1

#### Wave 2: regression guard
- [ ] **Task 1.2.1**: Write `index.test.ts` (kebab-safe sibling) — `readFileSync` the BODY, assert each ask's directives in a separately-named `describe` block (cost-compute / cost-per-outcome / structure-vs-executor) so partial drops fail loudly. Use `expect(body).toContain(token)`; no `-t`-only vacuous blocks.
  - Files: `packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.test.ts`
  - Verification: ac-08, ac-09, ac-10
  - Dependencies: 1.1.1, 1.1.2, 1.1.3

## Deliverables
- **D1**: REQ-13 ask 1 — token×model-rate cost compute → ac-01, ac-02, ac-03, ac-08
- **D2**: REQ-13 ask 2 — cost-per-outcome metrics → ac-04, ac-05, ac-09
- **D3**: REQ-13 ask 3 — structure-vs-executor token attribution → ac-06, ac-07, ac-10
- **D4**: test + type gates → ac-08, ac-09, ac-10, ac-11, ac-12

## Verification Criteria
- **ac-01**: `grep -niE 'opus.*sonnet.*haiku|haiku' .../index.ts` — BODY rate table names opus, sonnet, haiku.
- **ac-02**: `grep -nE 'inputTokens' .../index.ts && grep -nE 'outputTokens' .../index.ts` — both token-rate inputs referenced. [SPLIT → ac-02.1, ac-02.2]
- **ac-02.1**: `grep -nE 'inputTokens' .../index.ts` returns a match.
- **ac-02.2**: `grep -nE 'outputTokens' .../index.ts` returns a match.
- **ac-03**: `grep -nE '### Cost Summary' .../index.ts` returns a match.
- **ac-04**: `grep -nE '### Cost per Outcome' .../index.ts` returns a match.
- **ac-05**: `grep -niE 'phases-completed|phases completed' .../index.ts && grep -niE 'first-pass' .../index.ts` — both outcome denominators present. [SPLIT → ac-05.1, ac-05.2]
- **ac-05.1**: `grep -niE 'phases-completed|phases completed' .../index.ts` returns a match.
- **ac-05.2**: `grep -niE 'first-pass' .../index.ts` returns a match.
- **ac-06**: `grep -nE 'meta\.role' .../index.ts` returns a match (the ask-3 discriminator is documented).
- **ac-07**: `grep -niE 'executor' .../index.ts && grep -niE 'structure' .../index.ts` — both attribution buckets named. [SPLIT → ac-07.1, ac-07.2]
- **ac-07.1**: `grep -niE 'executor' .../index.ts` returns a match.
- **ac-07.2**: `grep -niE 'structure vs executor|structure bucket|structure' .../index.ts` returns a match.
- **ac-08**: `grep -nE "describe\('cost-compute" .../index.test.ts` — named cost-compute test block exists (non-vacuous).
- **ac-09**: `grep -nE "describe\('cost-per-outcome" .../index.test.ts` — named cost-per-outcome test block exists.
- **ac-10**: `grep -nE "describe\('structure-vs-executor" .../index.test.ts` — named structure-vs-executor test block exists.
- **ac-11**: `timeout 120 bun test packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.test.ts` exits 0.
- **ac-12**: `bunx --bun tsc --noEmit` exits 0.

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT bump telemetry schema version — `grep -nE "^\s*v:\s*2\b" packages/luca-core/src/telemetry/schemas.ts` returns no match (line-anchored; doc-comment `v: 2` on a `*`-prefixed line is excluded).
- **anti-02**: MUST NOT add a MuninnDB write — `grep -nE 'muninn_feedback|muninn_remember|muninn_evolve' .../index.ts` returns no match (skill stays read-only).
- **anti-03**: MUST NOT edit luca-mastracode instructions — `git diff --name-only` shows no path under `packages/luca-mastracode/src/instructions/`.

## Risks & Mitigations
- **Model null/drift**: `meta.model` may be null or carry a version suffix → substring-match `opus`/`sonnet`/`haiku` with a fallback rate + unknown-model flag in the report (directive, not crash).
- **Rate staleness**: hardcoded rates drift from real pricing → framed as operator-editable defaults with a "verify against current pricing" caveat in the table.
- **First-pass-success precision**: ambiguous definition → fixed literally: exactly one `review.iteration` ending APPROVED, verify passed, no fix re-entry.
- **Vacuous test**: `-t`-only blocks match 0 tests → use `toContain` per-named-`describe` blocks (G-DX-003 carried), no `-t`-gated probes.

## Decisions
- 2026-06-16 — Skill is instruction-body prose, not runnable code; all 3 asks are BODY directives, not unit-tested TS logic.
- 2026-06-16 — Model cost via substring-match `opus`/`sonnet`/`haiku` + fallback rate + unknown-model flag (model strings drift).
- 2026-06-16 — Attribution bucketing: executor = `meta.role === "executor"`; structure = every other role (unknown/future → structure, conservative).
- 2026-06-16 — Rates hardcoded as operator-editable markdown table in BODY with "verify current pricing" caveat (no runtime import possible).
- 2026-06-16 — first-pass-success = exactly one review.iteration ending APPROVED, verify passed, no fix re-entry.
- 2026-06-16 — Carried phase-1 follow-up (harden record-recall.test.ts quoted-JSON assertion) left OUT: different file, would expand scope; not blocking the 3 asks.
