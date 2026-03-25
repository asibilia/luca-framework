---
title: "Runtime X05: Define behavioral equivalence acceptance criteria for DAG-compiled prose"
area: runtime-architecture
created: 2026-03-24
source: docs/runtime-architecture/research/risk-analysis.md
depends_on: []
phase: runtime-x
estimated_files: 1
---

## Context

The DAG engine's Claude adapter will compile step definitions into prose that replaces the current hand-written `lu.skill.ts` (1,596 lines). "Identical behavior" for LLM-interpreted prose is not well-defined. The risk analysis (Risk 1, Likelihood HIGH, Impact HIGH) identifies this as the most dangerous moment of the initiative. This todo defines the concrete acceptance criteria that must be met before the switch.

## Task

### 1. Create acceptance criteria document

**File:** `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md`

Write the following content:

---

# Behavioral Equivalence Acceptance Criteria

**Date:** 2026-03-24
**Status:** Active
**Applies to:** Phase B Claude adapter — lu.skill.ts replacement

## Definition

"Behavioral equivalence" means the DAG-compiled prose produces workflow behavior that is functionally indistinguishable from the hand-written prose for a defined set of representative tasks. It does NOT mean character-for-character text identity.

## Acceptance Criteria

### Criterion 1: Structural completeness

The compiled prose must contain ALL of the following sections that exist in the current lu.skill.ts:

1. Entry point / routing logic
2. Complexity classification dispatch
3. Discussion phase (with premortem gate)
4. Plan discovery and wave grouping
5. Execution phase (with harness integration)
6. Code review dispatch (all reviewer agents)
7. UAT gate
8. Verification harness invocation
9. lu-verifier invocation
10. Learning capture
11. State/roadmap updates
12. Commit phase
13. Flag plumbing (--skip-review, --skip-uat, --skip-research, --run-premortem, etc.)

**Verification method:** Automated — diff the section headers/anchors between hand-written and compiled prose. All 13 sections must be present.

### Criterion 2: Gate enforcement

All gate checks must produce the same behavior:

| Gate         | Test                               | Expected behavior                        |
| ------------ | ---------------------------------- | ---------------------------------------- |
| premortem    | Run with `--run-premortem` flag    | Premortem phase executes                 |
| premortem    | Run without flag                   | Premortem phase is skipped (fail-closed) |
| process_data | Run with `--run-process-data` flag | Process data collection executes         |
| code_review  | Set `workflow.code_review: false`  | Code review is skipped                   |
| uat          | Set `workflow.uat_required: false` | UAT is skipped                           |

**Verification method:** Manual — run 5 tasks with different flag combinations, verify gate behavior matches.

### Criterion 3: Representative task completion (5-task suite)

Run the following 5 tasks through both hand-written and compiled prose. All must complete without errors:

| #   | Task type                    | Complexity | Key behavior tested                                    |
| --- | ---------------------------- | ---------- | ------------------------------------------------------ |
| 1   | Single-file bug fix          | TRIVIAL    | Minimal path — classify, plan, execute, verify, commit |
| 2   | Multi-file feature           | MODERATE   | Full path with code review                             |
| 3   | Cross-cutting refactor       | COMPLEX    | All steps including discussion, premortem              |
| 4   | Documentation update         | SIMPLE     | Skip-heavy path (--skip-review)                        |
| 5   | Failed verification recovery | MODERATE   | Harness fix loop — verify retry works                  |

**Verification method:** Manual A/B comparison. Run each task with both prose versions on the same codebase state. Document any behavioral differences.

**Acceptable divergences:**

- Wording differences in agent prompts that do not change behavior
- Ordering differences within a single phase (e.g., reviewer dispatch order)
- Whitespace/formatting differences in compiled output

**Unacceptable divergences:**

- Steps skipped that should not be
- Gates not enforced
- Flag plumbing broken (flags not reaching sub-skills)
- State machine transitions missing
- Harness not invoked at phase boundaries
- Verification loop not retrying on failure

### Criterion 4: State machine event parity

After running the 5-task suite, compare the state machine event logs (from `luca-bridge read-ledger`) between hand-written and compiled prose runs. The event sequences must match:

- Same set of events (START, PREFLIGHT_COMPLETE, ROUTE_COMPLETE, etc.)
- Same ordering of events
- Phase results recorded correctly

**Verification method:** Automated — diff ledger entries (excluding timestamps and session IDs).

### Criterion 5: No regression in build output

`bun run build:all` via the Claude adapter produces output files that are byte-identical to the current `bun run build:all` output for all non-lu.skill.ts artifacts. The lu.skill.ts output is allowed to differ (it is the compilation target).

**Verification method:** `bun run check:drift` passes after adapter compilation.

## Threshold

ALL 5 criteria must pass. There is no "partial pass." If any criterion fails, the compiled prose is not ready for production use and the hand-written prose remains the canonical orchestrator.

## Fallback Plan

If criteria are not met after 2 revision cycles of the compiled prose:

1. Keep hand-written lu.skill.ts as the production orchestrator
2. Use the DAG engine for validation and visualization only (not execution)
3. Document specific failures as input for future improvement
4. The DAG engine still provides value as a typed definition, build-time validator, and Mermaid visualizer even without replacing the prose

---

## Verification

- `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md` exists
- Document contains all 5 criteria with verification methods
- The 5-task representative suite is defined with specific task types and complexity levels
- Acceptable vs unacceptable divergences are explicitly listed
- Fallback plan is documented

## Notes

- This document is referenced by Phase B implementation. The implementing agent must run the 5-task suite before declaring the Claude adapter complete.
- The criteria deliberately avoid subjective metrics (e.g., "semantic similarity > 0.9"). Instead, they use structural checks (section presence), behavioral checks (gate enforcement), and event parity (ledger comparison).
