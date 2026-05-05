# Plan Review Capture — Iteration 1

**Subagent**: plan-reviewer
**Iteration**: 1
**Timestamp**: 2026-05-05

## Findings

```
STATUS: NEEDS_REVISION
CONVERGENCE: CONVERGING (initial review, no prior baseline)
BLOCKING_COUNT: 4
ADVISORY_COUNT: 7
```

### BLOCKING

**G-ARCH-001** — `state/phase-diff.ts` doesn't exist. Actual: `analysis/phase-diff.ts`. Likely doesn't write artifacts (computes diffs). Drop from list or move to analysis sub-task with correct path. Verify writes first.

**G-ARCH-002** — `save-plan-artifacts` handler in `tools/workflow-state.ts:728-748` hardcodes `.planning/` prefix; not in any migration task. Post-refactor this would persist wrong paths to state. Add explicit migration task: PLAN.md/CONTEXT.md/RESEARCH.md → `phaseDir(slug)`, ROADMAP.md → root.

**G-ARCH-003** — `archivePriorRun()` (state/session-ledger.ts:302+) moves JSONL + verification-result.json from root → `runs/<runId>/`. Decision #3 nests runs/ under phases/, Decision #4 keeps JSONL at root. Plan doesn't reconcile post-refactor archive semantics. Add sub-task specifying: which files archive, source/target paths, per-phase or per-run invocation.

**G-COMP-001** — Instructions list incomplete. Actual instructions/ has 10 files including `plan.md`, `discuss.md`, `fast.md`. Plan only lists 7. Either enumerate all OR change verification to grep entire `instructions/` directory.

### ADVISORY

**G-DX-001** — Task 2.2.2 bundles 10 tool migrations into one task. Not atomic. Split into 3+ tasks: (a) cross-phase root files (lock, todos, roadmap), (b) per-phase artifacts (check-convergence, confidence-journal, verification-result, run-postmortem, run-rules, claim-verifier), (c) cleanup recursion (repo-cleanup).

**G-DX-002** — Verification "grep returns only descriptive strings" not mechanically checkable. Replace with `! grep -nE "= '\\.planning/" packages/luca-mastracode/src/{tools,state}/` returning zero.

**G-DX-003** — No dogfooding self-test task. Verification criteria mentions it but no executable task. Add Phase 4 task: run pipeline finalize on this branch, assert layout.

**G-SEC-001** — Slug collision tests don't include race. Pipeline lock serializes triage; document "collision check under lock" + mkdir-EEXIST belt-and-suspenders.

**G-SCOPE-001** — gh-prepare skill audit conditional ("if affected"). Make unconditional with explicit "no .planning/ session-artifact paths" pass.

**G-COMP-002** — runs/<runId>/ nesting needs explicit test case. Add assertion: archive run → lives at `phases/<slug>/runs/<runId>/`.

**G-DX-004** — Stragglers whitelist diverges PLAN vs CONTEXT. CONFIDENCE-JOURNAL.md shouldn't be in post-migration whitelist. Two whitelists: (a) strict post-migration, (b) legacy-tolerant when slug absent.

### NIT

**G-NIT-001** — Plan says "177 references", research says "42 files". Both numbers belong together.

**G-NIT-002** — ROADMAP.md cosmetic "Phase 1: Phase 1: Foundation".

## Verdict

NEEDS_REVISION — 4 blocking, 7 advisory. Most blockers are factual corrections (wrong file path, missing handler, unresolved decision conflict, incomplete file list). Atomicity and verification quality also need work.
