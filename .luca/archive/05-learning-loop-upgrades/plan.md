---
id: 05-learning-loop-upgrades
title: Learning-loop upgrades — Deutsch C/R/L learnings + mandatory Gotchas field
waves: 2
tasks: 10
---

# Plan: Learning-loop upgrades (REQ-06 + REQ-07)

## Objective
Ship two independent learning-loop upgrades: (REQ-06) express learner output in Deutsch conjectured/refuted_by/learned/criterion_now shape; (REQ-07) add a `gotchas` field to every defineAgent/defineSubagent artifact, rendered into the compiled body. Both prose-driven; no new runtime consumers, no tests.

## Context
- Two disjoint-file tracks → run Wave A (REQ-07) and Wave B (REQ-06) in parallel.
- REQ-07: schema lives in `define/agent.ts` + `define/subagent.ts`; rendering in `compile/render-body.ts` (mirror `renderGuidancePrelude` :88-126, emission order :22-31); pass-through in `emit-agent.ts` :57-62 + `emit-subagent.ts` :65-70. 20 artifacts: modes/* (10), subagents/* (10). Skills/commands use a `body` field, bypass renderBody — OUT OF SCOPE.
- REQ-06: prose-only in `learner.ts` — extraction shape :57-63, learn.md section :74-78, TO_PERSIST :80-103. Carry C/R/L inside existing `content:` → zero orchestrator-contract (`packages/luca-tools/src/artifacts/skills/lu/index.ts:109`) and zero MuninnDB-schema change.
- Verify: `bunx --bun tsc --noEmit`, structural grep, compile-smoke fixture. No `.test.ts`, no `bun test`.

## Phases

### Wave A: REQ-07 — Gotchas field (parallel-safe with Wave B)

- [ ] **Task A.1**: Add OPTIONAL `gotchas` field (`z.array(z.string())`, default `[]`) to `AgentDefinitionSchema` and `SubagentDefinitionSchema` with a doc comment. NOT `.min(1)` (Q1: optional + audit, not required — see Decisions).
  - Files: packages/luca-tools/src/define/agent.ts, packages/luca-tools/src/define/subagent.ts
  - Verification: ac-01, ac-02
  - Dependencies: none

- [ ] **Task A.2**: Add `renderGotchasPrelude()` mirroring `renderGuidancePrelude` (no `Date.now()`/`Math.random()`); emit a `## Gotchas` block from a non-empty array. Extend `BodyRenderInput` with `gotchas`, wire into `renderBody` after instructions (slot near Guidance per emission-order doc).
  - Files: packages/luca-tools/src/compile/render-body.ts
  - Verification: ac-03, ac-04, anti-10
  - Dependencies: A.1

- [ ] **Task A.3**: Pass `gotchas: def.gotchas` through both `renderBody` call-sites.
  - Files: packages/luca-tools/src/compile/emit-agent.ts, packages/luca-tools/src/compile/emit-subagent.ts
  - Verification: ac-05
  - Dependencies: A.2

- [ ] **Task A.4a**: Author a non-empty `gotchas` value in all 10 mode-agents — each surfacing a real footgun for that stage.
  - Files: packages/luca-tools/src/artifacts/modes/{architect,build,discuss,execute,fast,finalize,plan,research,review,triage}.ts
  - Verification: ac-06
  - Dependencies: A.1

- [ ] **Task A.4b**: Author a non-empty `gotchas` value in all 10 subagents — footguns matter most for executor/reviewer.
  - Files: packages/luca-tools/src/artifacts/subagents/{debater,discussion,executor,learner,plan-reviewer,researcher,reviewer,shadow-scanner,test-writer,verifier}.ts
  - Verification: ac-07
  - Dependencies: A.1

- [ ] **Task A.5**: Set `gotchas: ['<footgun>']` on BOTH inline defs (`agent` ~:68-78, `subagent` ~:51-66) in the smoke fixture, AND add golden assertions `check('agent gotchas', agentText, '## Gotchas')` + `check('subagent gotchas', subagentText, '## Gotchas')` mirroring the `## Guidance` check at :268.
  - Files: packages/luca-tools/src/compile/__fixtures__/compile-smoke.ts
  - Verification: ac-08.1, ac-08.2
  - Dependencies: A.2

### Wave B: REQ-06 — Deutsch C/R/L learnings (parallel-safe with Wave A)

- [ ] **Task B.1**: Restructure the learner per-learning extraction shape (:57-63) to C/R/L fields: `CONJECTURED` / `REFUTED_BY` / `LEARNED` / `CRITERION_NOW` (keep LEARNING_TYPE/CONCEPT/CONFIDENCE for routing). Restructure in-place — do not add a parallel pass (Q2).
  - Files: packages/luca-tools/src/artifacts/subagents/learner.ts
  - Verification: ac-09, anti-06
  - Dependencies: none

- [ ] **Task B.2**: Update the learn.md write section (:74-78) so each learning renders C/R/L fields. Keep the `## Signal Synthesis` section unchanged.
  - Files: packages/luca-tools/src/artifacts/subagents/learner.ts
  - Verification: ac-10
  - Dependencies: B.1

- [ ] **Task B.3**: Carry C/R/L INSIDE the existing TO_PERSIST `content:` field (:88-103) — no new top-level block, no vault/concept/tags change. Verify `packages/luca-tools/src/artifacts/skills/lu/index.ts:109` orchestrator row stays accurate (reads vault/concept/content/tags only).
  - Files: packages/luca-tools/src/artifacts/subagents/learner.ts
  - Verification: ac-11, anti-07, ac-12
  - Dependencies: B.2

## Deliverables
- **D1**: REQ-06 — learner expresses learnings in Deutsch conjectured/refuted_by/learned/criterion_now shape (extraction + learn.md + TO_PERSIST content-carry) → ac-09, ac-10, ac-11, anti-06, anti-07
- **D2**: REQ-07 — each defineAgent/defineSubagent artifact carries a `gotchas` field rendered into the compiled body → ac-01, ac-02, ac-03, ac-04, ac-05, ac-06, ac-07, ac-08.1, ac-08.2, anti-05, anti-10

## Verification Criteria
- **ac-01**: `grep -c "gotchas" packages/luca-tools/src/define/agent.ts` ≥ 1 (0 as-built).
- **ac-02**: `grep -c "gotchas" packages/luca-tools/src/define/subagent.ts` ≥ 1 (0 as-built).
- **ac-03**: `grep -c "renderGotchasPrelude" packages/luca-tools/src/compile/render-body.ts` ≥ 2 (def + call; 0 as-built).
- **ac-04**: `grep -c "gotchas" packages/luca-tools/src/compile/render-body.ts` ≥ 3 (BodyRenderInput field + renderBody `input.gotchas` wiring + renderGotchasPrelude param/body; 0 as-built).
- **ac-05**: `grep -rc "gotchas" packages/luca-tools/src/compile/emit-agent.ts packages/luca-tools/src/compile/emit-subagent.ts` ≥ 1 each.
- **ac-06**: `grep -rL "gotchas:" $(grep -rl "defineAgent(" packages/luca-tools/src/artifacts/modes/)` returns zero files (field-token `gotchas:` — colon disambiguates the object key from prose like research.ts:232 "gotchas/edge cases"; scopes to the 10 real agent files, excludes the pure-barrel modes/index.ts).
- **ac-07**: `grep -rL "gotchas:" $(grep -rl "defineSubagent(" packages/luca-tools/src/artifacts/subagents/)` returns zero files (field-token `gotchas:`; scopes to the 10 real subagent files, excludes the pure-barrel subagents/index.ts).
- **ac-08**: [SPLIT → ac-08.1, ac-08.2]
- **ac-08.1**: compile the smoke fixture `packages/luca-tools/src/compile/__fixtures__/compile-smoke.ts` — exits 0.
- **ac-08.2**: the smoke fixture asserts the rendered `## Gotchas` block via two golden checks — `grep -c "'## Gotchas'" packages/luca-tools/src/compile/__fixtures__/compile-smoke.ts` ≥ 2 (0 as-built); ac-08.1 covers the compile exiting 0 once these checks are active.
- **ac-09**: `grep -ci "conjectur\|refuted_by\|criterion_now" packages/luca-tools/src/artifacts/subagents/learner.ts` ≥ 1 (0 as-built).
- **ac-10**: learner learn.md write section renders C/R/L fields — `grep -c "CRITERION_NOW\|criterion_now" learner.ts` confirms field present in the Step 2 body. NOTE: prose-placement requires verifier judgment (grep anchors presence, not correct section); ac-09 is the binary anchor for REQ-06.
- **ac-11**: TO_PERSIST `content:` example in learner.ts references C/R/L shape — `grep -A3 "content:" learner.ts` shows conjectured/refuted/learned phrasing. NOTE: requires verifier judgment (grep anchors phrasing presence, not contract correctness); ac-09 is the binary anchor for REQ-06.
- **ac-12**: `bunx --bun tsc --noEmit` exits 0 across the monorepo.

### Anti-criteria (regression guards)
- **anti-05**: MUST NOT — `gotchas` declared as a required `.min(1)` field; `grep "gotchas" packages/luca-tools/src/define/agent.ts packages/luca-tools/src/define/subagent.ts` shows no `.min(1)` (Q1: optional + audit).
- **anti-10**: MUST NOT — `Date.now()`/`Math.random()` in render-body.ts; `grep -c "Date.now\|Math.random" packages/luca-tools/src/compile/render-body.ts` = 0 (idempotence).
- **anti-06**: MUST NOT — introduce a new typed Zod learning schema lacking any runtime consumer; `grep -c "ConjectureSchema\|CRLSchema" learner.ts` = 0.
- **anti-07**: MUST NOT — add a parallel C/R/L TO_PERSIST block; `grep -c "### TO_PERSIST" learner.ts` = 1 (content-carry only; vault/concept/tags keys unchanged).
- **anti-08**: MUST NOT — create a `.test.ts` file or run `bun test`; `git status --porcelain` shows no new `*.test.ts`.
- **anti-09**: MUST NOT — reference an unshipped CLI verb/flag in edited prose; no `luca …` invocation in edited bodies may diverge from the shipped arg contract. NOTE: requires verifier judgment (no single exit-code probe enumerates each invocation).
- **anti-11**: MUST NOT — reference a nonexistent schema field in edited prose; no field name cited in edited bodies may be absent from the shipped schema. NOTE: requires verifier judgment (no single exit-code probe enumerates each cited field).

## Plan Review Resolutions (round 1)
- **G-DX-001** [BLOCKING] — ac-06/ac-07 globs matched the pure-barrel `index.ts` (no factory call → false-fail). Rescoped both to `grep -rL "gotchas" $(grep -rl "defineAgent(|defineSubagent(" …)` so only the 10 real factory files are probed.
- **G-DX-002** [BLOCKING] — smoke fixture's inline defs carried no `gotchas` → no `## Gotchas` ever emitted, ac-08.2 unreachable. Added Task A.5: set `gotchas` on both inline defs + two golden `check('… gotchas', …, '## Gotchas')` assertions; ac-08.2 retargeted to the fixture + golden checks.
- **G-CRIT-001** [ADVISORY] — ac-04 was non-binary (bare grep, no threshold). Pinned `≥ 3` (BodyRenderInput field + renderBody wiring + prelude param/body).
- **G-SCOPE-001** [ADVISORY] — replaced bare `lu/index.ts:109` with full path `packages/luca-tools/src/artifacts/skills/lu/index.ts:109` at Context and Task B.3.
- **G-CRIT-002** [ADVISORY] — ac-10/ac-11/anti-09/anti-11 flagged as verifier-judgment (not exit-code); ac-09 noted as the binary anchor for REQ-06. No structural change.

## Risks & Mitigations
- Mandatory-field flag-day → keep `gotchas` optional + audit (anti-05); 20 content sites land in A.4a/A.4b independent of schema.
- TO_PERSIST contract ripple → content-carry path (B.3) = zero ripple; verify lu/index.ts:109 (ac-12 + manual read).
- Double-emission to MuninnDB → restructure-in-place, single TO_PERSIST block (anti-07).
- Phantom-capability/field-drift → validate full commands + field names (anti-09).
- Render non-idempotence → renderGotchasPrelude no timestamp/random (anti-05).

## Decisions
- 2026-06-15 — Q1: `gotchas` is OPTIONAL field + parity audit (NOT required `.min(1)`); avoids module-load flag-day breaking the ARTIFACTS barrel. Confidence: low (logged).
- 2026-06-15 — Q2: C/R/L restructured in-place in learner, carried inside existing TO_PERSIST `content:` field — zero orchestrator-contract/MuninnDB-schema change. Confidence: medium (logged).
- 2026-06-15 — Q3: REQ-07 scope = agents (10) + subagents (10) = 20; skills/commands excluded (bypass renderBody). Confidence: high (logged).
