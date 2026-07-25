---
id: 01-context-compaction-318-remainder
title: Context Compaction (#318) remainder — init helper + envelope prose + cleanup
wave: 2
tasks: 10
---

# Plan: Context Compaction (#318) remainder

## Objective
Finish issue #318: auto-append a CLAUDE.md Compact Instructions block via a new
idempotent init helper, tighten this repo's own compact block, enforce compact
return-envelopes on verifier/reviewer/learner + both /lu surfaces, and remove the
contract-illegal `.continue-here.md` path.

## Context
STEP 0 (lu-handoff) + STEP 1 (researcher envelope, /lu boundary yield, phase-execute
§4.5, decision doc) already landed on branch `trace-insights-step0` (PR #323) — do NOT
re-plan them. Scope is FIXED by `context.md`; out of scope: `modes/research.ts`,
full-auto re-invoker, ANY `packages/luca-core` change. Prior art:
`ensureLucaGitignore` (`write-project-skeleton.ts:120-151`), `/lu` researcher row
(`skills/lu/index.ts:110`), decision doc `docs/decisions/orchestrator-context-pruning.md`.

## Phases

### Phase 1: #318 remainder

#### Wave 1: CLI init helper + repo docs (one executor)

- [ ] **Task 1.1.1**: Add `ensureCompactInstructions(cwd, log)` in new kebab-case file
  `packages/luca-cli/src/init/helpers/ensure-compact-instructions.ts`, modeled
  line-for-line on `ensureLucaGitignore`: labeled `## Compact Instructions` block,
  append-only-if-header-missing, no duplicate on re-run, never fights a user-modified
  copy. Block references lookup LOCATIONS only — `.luca/state.json` → pipelineStep /
  currentPhase / sessionId; `.luca/config.json` → muninn.vault; concept
  `session:phase-boundary-handoff` (recall after compaction) — never literal values.
  - Files: `packages/luca-cli/src/init/helpers/ensure-compact-instructions.ts`
  - Verification: ac-01, ac-05
  - Dependencies: none

- [ ] **Task 1.1.2**: Export `ensureCompactInstructions` from `init/index.ts` and call
  it in the init flow right after `writeProjectSkeleton` (`commands/init.ts:280`,
  Step 5 block), passing the project cwd + `p.log.info` logger.
  - Files: `packages/luca-cli/src/init/index.ts`, `packages/luca-cli/src/commands/init.ts`
  - Verification: ac-01, ac-03, ac-04
  - Dependencies: 1.1.1

- [ ] **Task 1.1.3**: Add `ensure-compact-instructions.test.ts` beside the helper,
  matching the `write-project-skeleton.test.ts` bun:test/mkdtemp pattern: fresh append
  writes the block; re-run is a no-op (no duplicate header); a user-modified block is
  left untouched.
  - Files: `packages/luca-cli/src/init/helpers/ensure-compact-instructions.test.ts`
  - Verification: ac-02
  - Dependencies: 1.1.1

- [ ] **Task 1.1.4**: Update THIS repo's `CLAUDE.md` `## Compact Instructions`
  (~lines 50-59): add the `session:phase-boundary-handoff` concept, the run-id
  (`.luca/state.json` → `sessionId`) pointer, and an explicit pipelineStep-preservation
  line.
  - Files: `CLAUDE.md`
  - Verification: ac-06, ac-07, ac-08

#### Wave 2: luca-tools return-envelope prose + cleanup (one executor — 1.2.4/1.2.5 touch distinct /lu files)

- [ ] **Task 1.2.1**: Add a gotcha + Output line to `subagents/verifier.ts` (near
  `:35`): return ONLY status / recommendation / convergence + criteria met/unmet counts
  + the `verify.json` path — never the full criterion-by-criterion analysis.
  - Files: `packages/luca-tools/src/artifacts/subagents/verifier.ts`
  - Verification: ac-01, ac-09

- [ ] **Task 1.2.2**: Tighten `subagents/reviewer.ts` return (Output Format
  `:114-137`): return ONLY PERSPECTIVE / VERDICT / the four CONSOLIDATED counts + the
  audit path — never the full FINDINGS block in-context.
  - Files: `packages/luca-tools/src/artifacts/subagents/reviewer.ts`
  - Verification: ac-01, ac-10

- [ ] **Task 1.2.3**: Scope `subagents/learner.ts` return to ONLY the
  `## Learnings (for orchestrator to persist)` block — keep TO_PERSIST fully intact
  (it is the orchestrator's only MuninnDB channel), drop the restated learn.md sections
  / Signal Synthesis from the reply. Add a NEW return-scoping line carrying the phrase
  "Return ONLY the TO_PERSIST envelope" (absent today), mirroring the verifier/reviewer
  "return only …" clauses.
  - Files: `packages/luca-tools/src/artifacts/subagents/learner.ts`
  - Verification: ac-01, ac-11, anti-02

- [ ] **Task 1.2.4**: Append hold-only-the-envelope clauses to `skills/lu/index.ts`
  verify/review/learn rows (`:117-119`), mirroring the researcher row. Each clause MUST
  contain a phrase ABSENT from the file today: verify row → "re-Read verify.json before
  branching"; review row → "hold only the per-perspective verdict"; learn row → "hold the
  TO_PERSIST block until persisted".
  - Files: `packages/luca-tools/src/artifacts/skills/lu/index.ts`
  - Verification: ac-01, ac-12, ac-12.1, ac-12.2

- [ ] **Task 1.2.5**: Sync `commands/lu.ts` with the skill: fix row 56 (researcher
  writes `research.md` itself, orchestrator holds only the summary — drop "Persist its
  output by writing"), and add a terse pointer-style phase-boundary handoff/yield note
  to row 65 mirroring `skills/lu/index.ts` (not a full copy).
  - Files: `packages/luca-tools/src/artifacts/commands/lu.ts`
  - Verification: ac-01, ac-13, ac-14

- [ ] **Task 1.2.6**: Remove `.continue-here.md` from `skills/session-pause/index.ts`
  (lines 14,46,104,117) and `skills/workflow-save/index.ts:132`; route the handoff
  through `lu-handoff` + `execute/progress.jsonl` per the decision doc.
  - Files: `packages/luca-tools/src/artifacts/skills/session-pause/index.ts`,
    `packages/luca-tools/src/artifacts/skills/workflow-save/index.ts`
  - Verification: ac-01, ac-15

## Deliverables
- **D1**: `ensureCompactInstructions` init helper + wiring + export → ac-03, ac-04, ac-05
- **D2**: This repo's `CLAUDE.md` Compact Instructions update → ac-06, ac-07, ac-08
- **D3**: Envelope prose on verifier/reviewer/learner + skills/lu rows → ac-09, ac-10, ac-11, ac-12, ac-12.1, ac-12.2, anti-02
- **D4**: `commands/lu.ts` sync (rows 56 + 65) → ac-13, ac-14
- **D5**: `.continue-here.md` removal (session-pause + workflow-save) → ac-15
- **D6**: Idempotent helper test → ac-02
- **D7**: Green build gate → ac-01, anti-01

## Verification Criteria
- **ac-01**: `bunx --bun tsc --noEmit` exits 0.
- **ac-02**: `bun test packages/luca-cli/src/init/helpers/ensure-compact-instructions.test.ts` exits 0 — covering cases: fresh-append, no-op-re-run, modified-block-untouched.
- **ac-03**: `grep -n "ensureCompactInstructions" packages/luca-cli/src/init/index.ts` matches (exported).
- **ac-04**: `grep -n "ensureCompactInstructions" packages/luca-cli/src/commands/init.ts` matches (wired into flow).
- **ac-05**: `grep -n "session:phase-boundary-handoff" packages/luca-cli/src/init/helpers/ensure-compact-instructions.ts` matches (block carries the concept).
- **ac-06**: `grep -n "session:phase-boundary-handoff" CLAUDE.md` matches.
- **ac-07**: `grep -n "sessionId" CLAUDE.md` matches (run-id pointer present).
- **ac-08**: `grep -n "pipelineStep" CLAUDE.md` matches (explicit preservation line).
- **ac-09**: `grep -niE "verify\.json.*path|return only|envelope" packages/luca-tools/src/artifacts/subagents/verifier.ts` matches (return-envelope instruction added).
- **ac-10**: `grep -niE "return only|envelope|audit path" packages/luca-tools/src/artifacts/subagents/reviewer.ts` matches (final-message envelope constrained).
- **ac-11**: `grep -c "Return ONLY the TO_PERSIST envelope" packages/luca-tools/src/artifacts/subagents/learner.ts` returns ≥1 (new return-scoping line added; not the pre-existing header).
- **ac-12**: `grep -c "re-Read verify.json before branching" packages/luca-tools/src/artifacts/skills/lu/index.ts` returns ≥1 (verify row envelope clause added).
- **ac-12.1**: `grep -c "hold only the per-perspective verdict" packages/luca-tools/src/artifacts/skills/lu/index.ts` returns ≥1 (review row envelope clause added).
- **ac-12.2**: `grep -c "hold the TO_PERSIST block until persisted" packages/luca-tools/src/artifacts/skills/lu/index.ts` returns ≥1 (learn row envelope clause added).
- **ac-13**: `grep -c "Persist its output by writing" packages/luca-tools/src/artifacts/commands/lu.ts` returns 0.
- **ac-14**: `grep -niE "handoff|yield|boundary" packages/luca-tools/src/artifacts/commands/lu.ts` matches (row 65 handoff/yield note present).
- **ac-15**: `grep -rn "\.continue-here" packages/luca-tools/src` shows only the `skills/phase-execute/index.ts` prohibition line (no session-pause / workflow-save hits).

### Anti-criteria (regression guards)
- **anti-01**: MUST NOT change any luca-core file — `git diff --name-only main...HEAD -- packages/luca-core` prints nothing (assumption: STEP 0/1 commits already on this branch did not touch luca-core — verified, they touched only luca-tools/docs — so any hit is this phase's regression).
- **anti-02**: MUST NOT remove the learner TO_PERSIST contract — `grep -n "TO_PERSIST" packages/luca-tools/src/artifacts/subagents/learner.ts` still matches.

## Risks & Mitigations
- Envelope edits are prose-only; wrong wording could weaken the TO_PERSIST channel — anti-02 guards it, and Task 1.2.3 keeps the block verbatim.
- New helper could duplicate on re-run — ac-02 idempotency test + header-presence check (ensureLucaGitignore pattern) mitigate.
- Two shipped /lu surfaces can drift — Task 1.2.5 mirrors the skill; both assigned to one executor.

## Decisions
- 2026-07-17 — `ensureCompactInstructions` lives in its own kebab-case helper file (single-responsibility) rather than appended to `write-project-skeleton.ts`.
- 2026-07-17 — Wave 1 = CLI+docs, Wave 2 = luca-tools prose; distinct file sets, parallel-safe across waves, single executor per wave.
