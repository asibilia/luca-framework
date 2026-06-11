---
id: 03-verification-doctrine
title: PAI verification doctrine for luca-verifier
complexity: COMPLEX
waves: 5
tasks: 16
---

# Plan: Verification Doctrine (REQ-03)

## Objective
Embed PAI's six verification-doctrine elements (evidence-in-block rule, probe table, forbidden-language list, [DEFERRED-VERIFY], ReReadCheck, deliverable manifest) into Luca's verifier/executor/architect/finalize instruction bodies plus the supporting luca-core schema and write-surface seams.

## Context
- Schema seam: `packages/luca-core/src/verification/schemas.ts` (VerificationCriterionSchema, VerificationResultSchema); aggregate at `verification-result.ts:131-162`; todo→done gate at `packages/luca-cli/src/write-surface/helpers/validate-verification-ref.ts`.
- Instruction bodies: `packages/luca-tools/src/artifacts/subagents/verifier.ts` (3 stale `luca verification write` refs at :24/:80/:122), `subagents/executor.ts` (step 4 + Self-Distrust Mandate), `modes/execute.ts` Step 3, `modes/review.ts`, `modes/finalize.ts` Step 3 Gap Detection, `modes/architect.ts` plan template, `subagents/plan-reviewer.ts`.
- Shared-constant precedent: `packages/luca-tools/src/artifacts/shared/` (CORE_OPERATING_RULES). Verify.json written via native Write gated by STEP_ARTIFACTS; `luca-phase-write-verify.ts` handler currently accepts unvalidated `z.record`.
- No tests in repo: verification gate is `bunx --bun tsc --noEmit` + grep/CLI structural probes.

## Decisions
1. **Forbidden-language**: instruction list in shared doctrine constant + advisory scan extension in existing claim-verifier (masks inline code spans); never blocking. No new CLI verb.
2. **Deferred encoding**: `met:false` + `deferred:true` + required `deferredFollowUp` (todo id via `luca todo add`, source `deferred-verify:<slug>:<ac-id>`). All existing consumers fail safe unchanged.
3. **luca-phase-write-verify**: validate payload with VerificationResultSchema (reject invalid), fix stale description.
4. **ReReadCheck source priority**: GitHub issue body → roadmap phase goal → context.md decisions; extends finalize Step 3 single Gap Report (no parallel gate).
5. **superRefine vs anti-02** (cycle 2): superRefine adds cross-field validation across the NEW deferred fields only (deferred:true ⇒ deferredFollowUp present AND met===false); no pre-existing field's type/optionality changes — anti-02 holds.
6. **runId sourcing** (cycle 2): luca-phase-write-verify stamps runId from `state.sessionId` (already loaded in the handler); omitted when absent — readVerificationResult tolerates legacy no-runId.
7. **Doctrine capability branch** (cycle 2): subagents (no MCP) RETURN the deferred-verify follow-up request in structured final output; orchestrator persists it (`luca todo add` + executes the returned muninn instruction); only orchestrator-context readers run it directly.
8. **Cycle-2 out-of-scope** (deliberately deferred): maskInlineCodeSpans canonical-home move to luca-core, criterion-grammar shared constant (phase-02 follow-up filed), probeType token column per probe row, evidence-window tuning, findSection wrapper inlining, fsGrepFiles symlink bound.

## Deliverables
- **D1**: Evidence-in-same-tool-block rule → ac-03, ac-07, ac-08
- **D2**: Per-artifact-type probe table (8 types + dual-evidence fallback for REVIEWING-blocked probes) → ac-03, ac-07
- **D3**: Forbidden-language list (5 phrases, "without evidence" framing) → ac-04, ac-14
- **D4**: [DEFERRED-VERIFY] marker + tracked follow-up + cannot-flip-to-met gate → ac-01, ac-05, ac-06, ac-16
- **D5**: ReReadCheck final gate in finalize → ac-12
- **D6**: Deliverable manifest D1..DN at plan time + compliance at verify → ac-02, ac-09, ac-10, ac-11, ac-12
- **D7**: Bonus drift fixes (stale `luca verification write` ×3, finalize:450 verificationRef, verify handler description) → ac-07, ac-12, ac-13

> Wave 5 (review cycle 2) remediations harden D1–D7 in place — no new deliverable; criteria ac-17–ac-24.

## Phases

### Phase 1: Verification Doctrine

#### Wave 1: Tracer bullet — deferred-verify slice end-to-end (schema → aggregate → gate → doctrine text)
- [ ] **Task 1.1.1**: Add optional `deferred?: boolean`, `deferredFollowUp?: string`, `probeType?: enum` to VerificationCriterionSchema; add `DeliverableComplianceSchema` ({id, description, criterionIds[], compliance: shipped|missed|partial}) and optional `deliverables?` array on VerificationResultSchema. Keep `met: boolean` and all existing required fields untouched.
  - Files: packages/luca-core/src/verification/schemas.ts, packages/luca-core/src/verification/index.ts (exports)
  - Verification: ac-01, ac-02, ac-15; anti-02

- [ ] **Task 1.1.2**: Create `packages/luca-tools/src/artifacts/shared/verification-doctrine.ts` exporting one ~30-40-line `VERIFICATION_DOCTRINE` constant: evidence-in-same-block rule, 8-row probe table (file write→Read back, code edit→Grep symbol, command→Bash checked output, HTTP→curl -i status+body, deploy→live version, UI→screenshot, schema/DB→SELECT, config/env→Read on disk) plus dual-evidence fallback (executor attestation in waves/NN.md + independent structural probe noted in verify.json notes), forbidden-language list ('should work', 'looks fine', 'tests pass', 'expected to', 'done' — forbidden only WITHOUT attached probe output), and [DEFERRED-VERIFY] protocol (met:false+deferred:true, `luca todo add` follow-up with source `deferred-verify:<slug>:<ac-id>`, criterion flips met only after deferred probe runs). Re-export from `shared/index.ts`.
  - Files: packages/luca-tools/src/artifacts/shared/verification-doctrine.ts (new), packages/luca-tools/src/artifacts/shared/index.ts
  - Verification: ac-03, ac-04, ac-16; anti-01

- [ ] **Task 1.1.3**: In `aggregateVerificationResults`, count any `deferred:true` criterion as a blocking gap (allCriteriaMet stays false regardless of met); in validate-verification-ref, return new explicit `CRITERION_DEFERRED` error before the generic CRITERION_UNMET path.
  - Files: packages/luca-core/src/verification/verification-result.ts, packages/luca-cli/src/write-surface/helpers/validate-verification-ref.ts
  - Verification: ac-05, ac-06, ac-15

#### Wave 2: Doctrine embedding in execution-side instruction bodies
- [ ] **Task 1.2.1**: Interpolate `VERIFICATION_DOCTRINE` into verifier.ts body (cold-isolated subagent — full constant, not condensed); replace all 3 stale `luca verification write` refs (:24,:80,:122) with the real path (native Write of verify.json per STEP_ARTIFACTS); add deliverable-compliance output instructions (populate `deliverables[]` from plan `## Deliverables` when present).
  - Files: packages/luca-tools/src/artifacts/subagents/verifier.ts
  - Verification: ac-07; anti-05

- [ ] **Task 1.2.2**: Interpolate `VERIFICATION_DOCTRINE` into executor.ts step-4 verification section and align Self-Distrust Mandate wording with it.
  - Files: packages/luca-tools/src/artifacts/subagents/executor.ts
  - Verification: ac-08; anti-05

- [ ] **Task 1.2.3**: execute.ts Step 3 gets a ≤5-line doctrine digest + pointer (not full copy) and the :262 stale ref fixed; review.ts verification sections (:71-82,:163-165,:194-202) reference doctrine + deferred semantics (deferred criterion = open gap).
  - Files: packages/luca-tools/src/artifacts/modes/execute.ts, packages/luca-tools/src/artifacts/modes/review.ts
  - Verification: ac-08

#### Wave 3: Deliverable manifest — plan-side
- [ ] **Task 1.3.1**: Add `## Deliverables` section to architect.ts plan template (grammar: `- **D<N>**: <explicit ask> → <ac-IDs>`; every D maps to ≥1 criterion) and add the section to both 150-line-budget exemption sentences (:38 region and behavioral guidelines :434 region).
  - Files: packages/luca-tools/src/artifacts/modes/architect.ts
  - Verification: ac-09

- [ ] **Task 1.3.2**: Extend luca-plan-lint with warn-only D-line checks: missing `## Deliverables` section, D-line not matching grammar, D-line referencing unknown ac-ID (reuse findVerificationCriteriaSection pattern + maskInlineCodeSpans).
  - Files: packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts
  - Verification: ac-10; anti-03

- [ ] **Task 1.3.3**: Add plan-reviewer check #10 (every D maps to ≥1 existing ac-ID; every explicit ask in phase goal appears as a D); mirror Deliverables-section guidance in phase-plan skill and phase-plan command (grep-confirm each instruction-referenced destination exists in shipped template).
  - Files: packages/luca-tools/src/artifacts/subagents/plan-reviewer.ts, packages/luca-tools/src/artifacts/skills/phase-plan/index.ts, packages/luca-tools/src/artifacts/commands/phase-plan.ts
  - Verification: ac-11

#### Wave 4: Finalize gate + write-surface hardening
- [ ] **Task 1.4.1**: Extend finalize.ts Step 3 Gap Detection into the ReReadCheck: re-read original request verbatim (priority: GitHub issue body → roadmap phase goal → context.md), enumerate every explicit ask against shipped work + `deliverables[]` compliance from verify.json, any miss blocks completion via the existing single Gap Report; fix :450 prose to `verificationRef: { criterionId }` matching VerificationRefSchema.
  - Files: packages/luca-tools/src/artifacts/modes/finalize.ts
  - Verification: ac-12

- [ ] **Task 1.4.2**: Replace `z.record` in luca-phase-write-verify with VerificationResultSchema validation (reject invalid payload with actionable error) and rewrite the stale description to the criteria/evidence/deliverables contract.
  - Files: packages/luca-cli/src/write-surface/handlers/luca-phase-write-verify.ts
  - Verification: ac-13; anti-02

- [ ] **Task 1.4.3**: Add advisory forbidden-language scan to claim-verifier (flag the 5 phrases when no evidence marker nearby; mask inline code spans; output warnings only — never alters exit code or gate verdict).
  - Files: packages/luca-core/src/claim-verifier/claim-verifier.ts, packages/luca-cli/src/commands/claim-verify.ts
  - Verification: ac-14; anti-03

#### Wave 5: Review fixes (cycle 2)
- [ ] **Task 1.5.1**: Rewrite every phantom `luca claim-verify` invocation to the shipped grammar `luca claim-verify <file> [--repo-root]`: review.ts:205 and finalize.ts:200,310,467,471 stage text inputs at `.luca/tmp/<name>.md` first, then branch on exit code 0/1. Delete the `code: CLAIM_VERIFICATION_FAILED` envelope branching at finalize.ts:313 — the CLI emits logger lines + exit code only.
  - Files: packages/luca-tools/src/artifacts/modes/review.ts, packages/luca-tools/src/artifacts/modes/finalize.ts
  - Verification: ac-17, ac-15; anti-06

- [ ] **Task 1.5.2**: luca-tools doctrine + drift fixes: amend [DEFERRED-VERIFY] step 2 per Decision 7 (subagent returns follow-up request in structured output; orchestrator persists) and drop the stale "(wave 2 wires the interpolation)" comment; add `timestamp` to the verifier.ts verify.json template (:125-138) and change the `d-01` example id to plan-grammar `D1`. Replace the hand-typed forbidden-phrase literals at executor.ts:150 and the execute.ts:265 digest fragment with `FORBIDDEN_LANGUAGE_PHRASES` interpolation.
  - Files: packages/luca-tools/src/artifacts/shared/verification-doctrine.ts, packages/luca-tools/src/artifacts/subagents/verifier.ts, packages/luca-tools/src/artifacts/subagents/executor.ts, packages/luca-tools/src/artifacts/modes/execute.ts
  - Verification: ac-18, ac-20, ac-24.1; anti-05

- [ ] **Task 1.5.3**: luca-cli/luca-core write path: route luca-phase-write-verify through `writeVerificationResult` with runId per Decision 6; add superRefine on VerificationCriterionSchema per Decision 5 and fix the schemas.ts `d-01` doc example to `D1`. In validate-verification-ref, parse verify.json with VerificationResultSchema.safeParse (schema-invalid → VERIFY_FILE_INVALID, drop the raw `as` cast) and wrap every echoed runtime string (criterionId, id join, deferredFollowUp, status, JSON.parse err.message) with sanitizeControlChars extracted to a shared `write-surface/helpers/sanitize-control-chars.ts` (both existing copies import it).
  - Files: packages/luca-cli/src/write-surface/handlers/luca-phase-write-verify.ts, packages/luca-core/src/verification/schemas.ts, packages/luca-cli/src/write-surface/helpers/validate-verification-ref.ts, packages/luca-cli/src/write-surface/helpers/sanitize-control-chars.ts (new)
  - Verification: ac-19, ac-21.1, ac-22, ac-23; anti-02

- [ ] **Task 1.5.4**: Sanitize echoed artifact-derived strings in claim-verify.ts (:63 evidence/claim text, :71 sourceContext) via the shared helper; update the stale "four regex checks" module header (plan.ts:12-17) and lint subcommand description (:30-36) to the seven-check (a–g) inventory incl. deliverable checks.
  - Files: packages/luca-cli/src/commands/claim-verify.ts, packages/luca-cli/src/commands/write-surface/plan.ts
  - Verification: ac-21.2, ac-24.2; anti-06

## Verification Criteria

- **ac-01**: VerificationCriterionSchema gains deferral fields (umbrella; met by ac-01.1–.3).
- **ac-01.1**: `grep -n "deferredFollowUp" packages/luca-core/src/verification/schemas.ts` hits (symbol absent pre-phase).
- **ac-01.2**: `deferred` is an optional boolean on VerificationCriterionSchema; its JSDoc states `deferredFollowUp` is required when set.
- **ac-01.3**: `probeType` is an optional enum on VerificationCriterionSchema.
- **ac-02**: `grep -n "DeliverableComplianceSchema" packages/luca-core/src/verification/schemas.ts` hits; compliance enum is exactly `['shipped', 'missed', 'partial']`; `deliverables` is optional on VerificationResultSchema.
- **ac-03**: Shared doctrine constant ships complete (umbrella; met by ac-03.1–.3).
- **ac-03.1**: `packages/luca-tools/src/artifacts/shared/verification-doctrine.ts` exists; `grep -n "verification-doctrine" packages/luca-tools/src/artifacts/shared/index.ts` hits.
- **ac-03.2**: Constant probe table contains each of 8 rows: file write, code edit, command, HTTP/API, deploy, UI, schema/DB, config/env.
- **ac-03.3**: Constant contains the dual-evidence fallback for probes stage-gate-blocked in REVIEWING (executor attestation in waves/NN.md + independent structural probe noted in verify.json notes).
- **ac-04**: Forbidden-language list ships complete (umbrella; met by ac-04.1–.2).
- **ac-04.1**: Constant enumerates each of 5 phrases: 'should work', 'looks fine', 'tests pass', 'expected to', 'done'.
- **ac-04.2**: Constant states the phrases are forbidden only WITHOUT attached probe evidence.
- **ac-05**: `grep -n "deferred" packages/luca-core/src/verification/verification-result.ts` hits inside aggregateVerificationResults; constructed-input reasoning check: a result whose only unmet item is deferred:true yields allCriteriaMet=false.
- **ac-06**: `grep -n "CRITERION_DEFERRED" packages/luca-cli/src/write-surface/helpers/validate-verification-ref.ts` hits, returned before CRITERION_UNMET for deferred criteria.
- **ac-07**: `grep -c "luca verification write" packages/luca-tools/src/artifacts/subagents/verifier.ts` returns 0 (3 hits pre-phase); `grep -n "VERIFICATION_DOCTRINE" .../subagents/verifier.ts` shows interpolation; body instructs populating `deliverables[]`.
- **ac-08**: Doctrine reaches execution-side bodies (umbrella; met by ac-08.1–.3).
- **ac-08.1**: `grep -n "VERIFICATION_DOCTRINE" packages/luca-tools/src/artifacts/subagents/executor.ts` hits (interpolation, not literal copy).
- **ac-08.2**: execute.ts Step 3 digest references the doctrine; `grep -c "luca verification write" packages/luca-tools/src/artifacts/modes/execute.ts` returns 0.
- **ac-08.3**: review.ts mentions deferred-criterion = open-gap semantics.
- **ac-09**: `grep -n "## Deliverables" packages/luca-tools/src/artifacts/modes/architect.ts` hits in template; both line-budget exemption sentences name the Deliverables section.
- **ac-10**: Plan-lint covers D-lines (umbrella; met by ac-10.1–.2).
- **ac-10.1**: `grep -n "Deliverables" packages/luca-cli/src/write-surface/handlers/luca-plan-lint.ts` hits.
- **ac-10.2**: Linting a fixture plan whose D-line references a nonexistent ac-ID emits a warning; exit code stays 0.
- **ac-11**: plan-reviewer.ts contains a numbered manifest-mapping check; `grep -n "Deliverables" packages/luca-tools/src/artifacts/skills/phase-plan/index.ts packages/luca-tools/src/artifacts/commands/phase-plan.ts` hits both.
- **ac-12**: Finalize gate extended (umbrella; met by ac-12.1–.3).
- **ac-12.1**: `grep -n "ReReadCheck" packages/luca-tools/src/artifacts/modes/finalize.ts` hits.
- **ac-12.2**: finalize.ts spells out source priority: GitHub issue body → roadmap phase goal → context.md.
- **ac-12.3**: finalize.ts :450-region prose says `verificationRef: { criterionId }`; no `wave` field mentioned.
- **ac-13**: Verify handler hardened (umbrella; met by ac-13.1–.3).
- **ac-13.1**: luca-phase-write-verify imports VerificationResultSchema.
- **ac-13.2**: Handler rejects an invalid payload (probe: invoke against a bad fixture, observe error result).
- **ac-13.3**: Old `z.record(z.string(), z.unknown())` result shape gone from the handler.
- **ac-14**: claim-verifier scan flags `should work` in a prose fixture but NOT inside backticks; CLI exit code unchanged when only forbidden-language warnings present.
- **ac-15**: `bunx --bun tsc --noEmit` exits 0 across the monorepo.
- **ac-16**: [DEFERRED-VERIFY] protocol complete (umbrella; met by ac-16.1–.2).
- **ac-16.1**: Doctrine names `luca todo add` follow-up; source pattern `deferred-verify:<slug>:<ac-id>` present verbatim.
- **ac-16.2**: Doctrine states a deferred criterion cannot flip to met until the deferred probe runs.
- **ac-17**: Phantom claim-verify grammar purged (umbrella; met by ac-17.1–.2).
- **ac-17.1**: `grep -c "verify-text" packages/luca-tools/src/artifacts/modes/review.ts` returns 0 (1 pre-fix); `grep -c "verify-file" packages/luca-tools/src/artifacts/modes/finalize.ts` returns 0 (1 pre-fix); `grep -c "claim-verify gate" .../modes/finalize.ts` returns 0 (4 pre-fix).
- **ac-17.2**: `grep -c "CLAIM_VERIFICATION_FAILED" .../modes/finalize.ts` returns 0 (1 pre-fix); rewritten call sites branch on exit code and stage text inputs under `.luca/tmp/`.
- **ac-18**: Verifier template schema-complete: `grep -c "timestamp" packages/luca-tools/src/artifacts/subagents/verifier.ts` ≥1 (0 pre-fix) inside the verify.json template block; `grep -c '"d-01"' .../subagents/verifier.ts` returns 0 (1 pre-fix), example id is `"D1"`.
- **ac-19**: `grep -c "writeVerificationResult" packages/luca-cli/src/write-surface/handlers/luca-phase-write-verify.ts` ≥1 (0 pre-fix); handler passes runId from `state.sessionId` when it is a string.
- **ac-20**: Doctrine capability-aware (umbrella; met by ac-20.1–.2).
- **ac-20.1**: [DEFERRED-VERIFY] step 2 instructs subagents to RETURN the follow-up request in structured output for orchestrator persistence; no instruction tells a subagent to execute the muninn instruction itself.
- **ac-20.2**: `grep -c "wave 2 wires" packages/luca-tools/src/artifacts/shared/verification-doctrine.ts` returns 0 (1 pre-fix).
- **ac-21**: Echo sanitization complete (umbrella; met by ac-21.1–.2).
- **ac-21.1**: `grep -c "sanitizeControlChars" packages/luca-cli/src/write-surface/helpers/validate-verification-ref.ts` ≥1 (0 pre-fix); criterionId, existing-id join, deferredFollowUp, status, and JSON.parse err.message are all wrapped.
- **ac-21.2**: `grep -c "sanitizeControlChars" packages/luca-cli/src/commands/claim-verify.ts` ≥1 (0 pre-fix), covering sourceContext and evidence/claim-text echoes.
- **ac-22**: `grep -c "superRefine" packages/luca-core/src/verification/schemas.ts` ≥1 (0 pre-fix) enforcing deferred:true ⇒ deferredFollowUp present AND met===false; `grep -c "d-01" .../verification/schemas.ts` returns 0 (1 pre-fix).
- **ac-23**: `grep -c "safeParse" packages/luca-cli/src/write-surface/helpers/validate-verification-ref.ts` ≥1 (0 pre-fix); inline `as` cast of verify.json gone; schema-invalid file returns VERIFY_FILE_INVALID.
- **ac-24**: Drift docs fixed (umbrella; met by ac-24.1–.2).
- **ac-24.1**: `grep -c "'should work'" packages/luca-tools/src/artifacts/subagents/executor.ts` and `.../modes/execute.ts` each return 0 (1 each pre-fix); phrase list/count rendered via `FORBIDDEN_LANGUAGE_PHRASES` interpolation.
- **ac-24.2**: `grep -c "four regex" packages/luca-cli/src/commands/write-surface/plan.ts` returns 0 (1 pre-fix); lint subcommand description enumerates the seven checks incl. deliverable checks.
- **anti-01**: MUST NOT — register any new CLI verb/subcommand for doctrine features (no new command added to packages/luca-cli/src/cli.ts or write-surface command tables this phase; baseline = command list at phase start).
- **anti-02**: MUST NOT — change type or required/optional status of any pre-existing field on VerificationCriterionSchema/VerificationResultSchema (interpretation: only the additions named in ac-01/ac-02 may appear in the schema diff).
- **anti-03**: MUST NOT — make forbidden-language scan or plan-lint D-line checks blocking (no non-zero exit, no gate failure path keyed on them).
- **anti-04**: MUST NOT — create any `.test.ts`/`.spec.ts` file or invoke `bun test`.
- **anti-05**: MUST NOT — duplicate doctrine text as hand-written copies; each of verifier.ts, executor.ts must interpolate the shared constant (literal re-typing of probe-table rows in those files = violation).
- **anti-06**: MUST NOT — change the shipped `luca claim-verify` CLI grammar this wave (no subcommands/flags added or removed in commands/claim-verify.ts or cli.ts; only echo-sanitization edits permitted there). Instruction text adapts to the CLI, not vice versa.

> Lint dismissals: remaining compound-criterion warnings on ac-02, ac-05, ac-06, ac-07, ac-09, ac-11, ac-14 are prose-only — each clause is a probe on the same single artifact, halves cannot pass/fail independently in a way that changes the verdict. Same dismissal extends to wave-5 criteria ac-17.1, ac-17.2, ac-18, ac-19, ac-21.1, ac-22, ac-23, ac-24.1, ac-24.2 (multi-grep clauses are before/after probes on one fix each). Cycle-2 attestation: `luca plan lint` could not be re-run — stage-gate blocks Bash (bash-mutate) in pipelineStep=plan; checks (a)–(g) verified manually against the amended file.

## Risks & Mitigations
- **Verifier body bloat**: doctrine constant capped ~40 lines, tables not prose; execute.ts gets digest only.
- **Forbidden-language false positives**: advisory-only + code-span masking + "without evidence" qualifier.
- **Deferred leaking past gates**: tracer wave 1 wires schema→aggregate→todo-gate before any instruction text ships.
- **Instruction/template drift**: task 1.3.3 grep-confirms every referenced destination exists in the same delta (phase-02 learning).
