---
id: 01-recall-outcome-attribution
title: Recall outcome attribution (REQ-11 record-recall parity + REQ-12 utilization telemetry)
wave: 3
tasks: 8
---

# Plan: Recall outcome attribution

## Objective
Close the v13 record-recall gap (REQ-11) by porting a RUNNABLE `record-recall` emit directive into the 4 missing luca-tools `.ts` modes, regression-protect it with a `.ts`-surface test, and add REQ-12 memory-utilization attribution via a new `recall.utilization` telemetry kind correlated to outcome valence at read-time. Approach 1 only — no `muninn_feedback`, no schema version bump.

## Context
Only `triage.ts:84` carries the directive today (prose form); `architect.ts`, `execute.ts`, `review.ts`, `finalize.ts` recall without emitting. The directive ported in must be RUNNABLE: `luca telemetry emit --kind recall.hit|recall.miss --run-id <runId> --meta '{...}'` with the 6 `recordRecallAction` meta keys (`query`/`resultCount`/`verifiedCount`/`vault`/`callerMode`/`durationMs`) — canonical source `packages/luca-mastracode/src/tools/workflow-state.ts:1851-1858` (note: the key is `callerMode`, not `mode`). Each directive ALSO carries `recalledIds` (array of recalled concept ULIDs) in its meta from the start, so REQ-12 knows which IDs were in scope at every recall — this is why REQ-12's recall-time capture lives in Wave 1, not Wave 3. `recall.hit`/`recall.miss` already on the open `TelemetryKind` union (`schemas.ts:36-37`); `recall.utilization` is added the same way (no `v` bump). Read-time correlation home: learn step (in `review.ts`) + `luca-telemetry-report` skill Step 5 (already tallies `recall.*`). Gate: `bunx --bun tsc --noEmit`; tests bounded `timeout 120 bun test <file>`. Legacy luca-mastracode `.md` instructions untouched.

## Phases

### Phase 1: REQ-11 record-recall parity (.ts modes)

#### Wave 1: Port runnable record-recall directive into 4 modes (parallel-safe)
Each ported directive is the full RUNNABLE command with all 6 meta keys (`query`/`resultCount`/`verifiedCount`/`vault`/`callerMode`/`durationMs`) PLUS `recalledIds` (recalled concept ULIDs) — the latter is REQ-12's recall-time capture, baked in from the start so there is no Wave-1↔Wave-3 dependency.
- [ ] **Task 1.1.1**: Add runnable `record-recall` emit directive after the recall block in `architect.ts` (template = triage.ts intent, full command + 6 meta keys + `recalledIds`, hit vs miss by resultCount).
  - Files: packages/luca-tools/src/artifacts/modes/architect.ts
  - Verification: ac-01, ac-07
- [ ] **Task 1.1.2**: Add the same runnable directive (6 keys + `recalledIds`) after the `muninn_recall` call in `execute.ts:310`.
  - Files: packages/luca-tools/src/artifacts/modes/execute.ts
  - Verification: ac-02, ac-07
- [ ] **Task 1.1.3**: Add the same runnable directive (6 keys + `recalledIds`) after the `muninn_recall` call in `review.ts:141`.
  - Files: packages/luca-tools/src/artifacts/modes/review.ts
  - Verification: ac-03, ac-07
- [ ] **Task 1.1.4**: Add the same runnable directive (6 keys + `recalledIds`) after both `muninn_recall` calls in `finalize.ts`.
  - Files: packages/luca-tools/src/artifacts/modes/finalize.ts
  - Verification: ac-04, ac-06, ac-07
- [ ] **Task 1.1.5**: Upgrade `triage.ts:84` prose directive to the same RUNNABLE form (6 keys + `recalledIds`) so all 5 modes are uniform.
  - Files: packages/luca-tools/src/artifacts/modes/triage.ts
  - Verification: ac-05, ac-07

#### Wave 2: Regression-protect the .ts surface
- [ ] **Task 1.2.1**: Add a luca-tools test that iterates EACH of the 5 mode `.ts` artifact bodies INDEPENDENTLY (one assertion block per mode, failing if ANY single mode is missing a required token — not an aggregate "≥1 mode has it"). Per mode assert: `luca telemetry emit`, `--kind recall.`, the REQUIRED `--run-id` flag, all 6 meta keys, and `recalledIds`.
  - Files: packages/luca-tools/src/artifacts/modes/record-recall.test.ts
  - Verification: ac-07, ac-14, anti-03
  - Dependencies: 1.1.1, 1.1.2, 1.1.3, 1.1.4, 1.1.5

### Phase 2: REQ-12 utilization telemetry

#### Wave 3: New kind + emit + read-time aggregator
- [ ] **Task 2.3.1**: TWO edits required (tsc will NOT catch a missing barrel re-export — ac-09 guards it): (a) in `schemas.ts` add `recall.utilization` to the `TelemetryKind` union and define `RecallUtilizationMetaSchema` (`recalledIds: string[]`, `outcome`, `step`), keeping `v: 1`; (b) in `telemetry/index.ts` re-export `RecallUtilizationMetaSchema` from the barrel.
  - Files: packages/luca-core/src/telemetry/schemas.ts, packages/luca-core/src/telemetry/index.ts
  - Verification: ac-08, ac-09, anti-01, anti-02
- [ ] **Task 2.3.2**: Add the outcome-time `recall.utilization` emit in the learn step (review.ts) ONLY — correlate the run's recalledIds to verify/review valence by runId+step and emit `luca telemetry emit --kind recall.utilization --run-id <runId>`. (Recall-time `recalledIds` capture already shipped in Wave 1.)
  - Files: packages/luca-tools/src/artifacts/modes/review.ts
  - Verification: ac-10, ac-11
  - Dependencies: 2.3.1
- [ ] **Task 2.3.3**: Teach the `luca-telemetry-report` skill body to read `recall.utilization` records and report recalled-ID→outcome-valence correlation alongside existing recall hit/miss tallies.
  - Files: packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts
  - Verification: ac-12
  - Dependencies: 2.3.1

## Deliverables
- **D1**: REQ-11 .ts wiring — runnable record-recall directive in the 5 luca-tools .ts modes → ac-01, ac-02, ac-03, ac-04, ac-05, ac-06
- **D2**: REQ-11 test — .ts-surface per-mode test asserting runnable record-recall across the 5 modes → ac-07, ac-14
- **D3**: REQ-12 schema — recall.utilization kind plus advisory meta re-exported from barrel, no v bump → ac-08, ac-09
- **D4**: REQ-12 emit — recalledIds in all 5 recall metas (Wave 1) plus outcome-time utilization emit (review.ts) → ac-10, ac-11, ac-14
- **D5**: REQ-12 aggregator — read-time correlation in telemetry-report skill → ac-12

## Verification Criteria
- **ac-01**: `grep -E "luca telemetry emit --kind recall\.(hit\|miss) --run-id" packages/luca-tools/src/artifacts/modes/architect.ts` matches.
- **ac-02**: `grep -E "luca telemetry emit --kind recall\.(hit\|miss) --run-id" packages/luca-tools/src/artifacts/modes/execute.ts` matches.
- **ac-03**: `grep -E "luca telemetry emit --kind recall\.(hit\|miss) --run-id" packages/luca-tools/src/artifacts/modes/review.ts` matches.
- **ac-04**: `grep -E "luca telemetry emit --kind recall\.(hit\|miss) --run-id" packages/luca-tools/src/artifacts/modes/finalize.ts` matches.
- **ac-05**: `grep -E "luca telemetry emit --kind recall\.(hit\|miss) --run-id" packages/luca-tools/src/artifacts/modes/triage.ts` matches.
- **ac-06**: `grep -E "query.*resultCount.*verifiedCount.*vault.*callerMode.*durationMs" packages/luca-tools/src/artifacts/modes/finalize.ts` matches (smoke check that the 6 keys appear in one ported directive; ac-07 is the AUTHORITATIVE per-mode 6-key gate).
- **ac-07**: `timeout 120 bun test packages/luca-tools/src/artifacts/modes/record-recall.test.ts` exits 0 — authoritative per-mode gate; the suite checks `--run-id` plus the 6 meta keys independently per mode, failing if any single mode lacks one.
- **ac-08**: `grep -n "recall.utilization" packages/luca-core/src/telemetry/schemas.ts` matches (kind added to union).
- **ac-09**: `grep -n "RecallUtilizationMetaSchema" packages/luca-core/src/telemetry/index.ts` matches (advisory meta exported).
- **ac-10**: `grep -E "recalledIds" packages/luca-tools/src/artifacts/modes/review.ts` matches (recalled IDs threaded into emit meta).
- **ac-14**: `timeout 120 bun test packages/luca-tools/src/artifacts/modes/record-recall.test.ts -t recalledIds` exits 0 — the suite asserts each of the 5 mode bodies contains the `recalledIds` meta key, failing if any single mode lacks it.
- **ac-11**: `grep -E "luca telemetry emit --kind recall\.utilization --run-id" packages/luca-tools/src/artifacts/modes/review.ts` matches (outcome-time utilization emit).
- **ac-12**: `grep -E "recall\.utilization" packages/luca-tools/src/artifacts/skills/luca-telemetry-report/index.ts` matches (skill reads the new kind).
- **ac-13**: `bunx --bun tsc --noEmit` exits 0.

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT bump telemetry schema version — `grep -nE "^\s*v:\s*2\b" packages/luca-core/src/telemetry/schemas.ts` returns no match (line-anchored to the `v:` field declaration at schemas.ts:46; excludes the doc-comment `v: 2` at schemas.ts:13. Verified empty against the unmodified file).
- **anti-02**: MUST NOT introduce a `muninn_feedback` call — `grep -rn "muninn_feedback" packages/luca-tools/src packages/luca-core/src` returns no match.
- **anti-03**: MUST NOT edit the legacy luca-mastracode `.md` instructions — `git diff --name-only` lists no file under `packages/luca-mastracode/src/instructions/`.

## Risks & Mitigations
- Phantom-capability pitfall (token-presence passing for a non-runnable stub): every ac probe matches the full command incl. `--run-id`; ac-07 is the authoritative per-mode gate asserting all 6 meta keys for EACH of the 5 modes independently (fails if any one mode is missing a key).
- Run-level→per-memory attribution is noisy: accepted MVP tradeoff (context.md D2); correlation is statistical by runId+step, documented in the skill output.
- Legacy `.md` drift: anti-03 guards against accidental edits; parity is intentionally `.ts`-only this phase.

## Decisions
- 2026-06-15 — New kind named exactly `recall.utilization`; Approach 1 (utilization telemetry), no `muninn_feedback`, no `v` bump (context.md D2/D3).
- 2026-06-15 — `.ts`-surface test is a new sibling in luca-tools (not an extension of luca-mastracode's `.md`-only recall-prose.test.ts) to avoid cross-package coupling.
- 2026-06-15 — Read-time correlation lives in the learn step (review.ts) + telemetry-report skill, where `recall.*` is already aggregated.
