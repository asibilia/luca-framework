---
phase: 17-iterative-agent-loops
status: complete
plans: 6
waves: 4
requirements: ITER-01 through ITER-07 (all satisfied)
---

# Phase 17 Summary: Iterative Agent Loops (Ralph Wiggum)

## Goal

Implement the Ralph Wiggum pattern -- externally-controlled iteration loops driven by decision-support utilities, not LLM self-assessment. Add convergence detection, checkpoint/rollback, error classification, cost budgets, and both HITL and AFK modes.

## Plans Executed

| Plan  | Wave | Title                                           | Status   |
| ----- | ---- | ----------------------------------------------- | -------- |
| 17-01 | 1    | Iteration Types & Schemas                       | complete |
| 17-02 | 2    | Convergence Detection & Error Classification    | complete |
| 17-03 | 2    | Checkpoint & Budget Utilities                   | complete |
| 17-04 | 3    | ComplexityGate Extension & Verifier Enhancement | complete |
| 17-05 | 4    | Orchestrator Loop Protocol & Skill Update       | complete |
| 17-06 | 4    | Learning Capture & State Updates                | complete |

## Delivered

### New Module: src/iteration/

- `types.ts` -- 17 Zod schemas defining the iteration type vocabulary (ErrorFingerprint, ClassifiedError, ConvergenceResult, IterationRecord, BudgetState, LoopConfig, LoopResult, etc.)
- `convergence.ts` -- Multi-signal convergence detection (createFingerprint, computeFingerprintOverlap, computeConvergenceSignals, assessConvergence). 2-of-3 stale rule with configurable threshold.
- `classifier.ts` -- Rule-based error classification (classifySingleError, classifyErrors, partitionByClass). Source-based + pattern-based + promotion logic.
- `checkpoint.ts` -- Git tag checkpoint management (createCheckpoint, rollbackToCheckpoint, prunePhaseCheckpoints). JSON metadata in .planning/checkpoints/.
- `budget.ts` -- Iteration cost tracking (createBudgetState, assessBudget, advanceBudget, shouldStartIteration). 80% soft stop threshold.
- `index.ts` -- Barrel export of all public functions and types.

### Modified Modules

- `src/complexity/types.ts` -- Added `verifyFixIterations` to ComplexityGate interface
- `src/complexity/defaults.ts` -- Added verifyFixIterations defaults (TRIVIAL:0, SIMPLE:1, MODERATE:1, COMPLEX:2, CRITICAL:3)
- `src/context/result-envelope.ts` -- Added `source_plan` optional field to resultIssueSchema
- `src/agents/general/lu-verifier.agent.ts` -- Enhanced gap YAML template with source_plan attribution
- `.planning/config.json` -- Added iteration section (default_mode, soft_stop_percent, stale_threshold, promotion_threshold) and verifyFixIterations to complexity matrix

### Skill Update

- `.claude/skills/lu-execute-phase/SKILL.md` -- Replaced Step 6.6 with Loop A (harness fix loop), added Step 7.5 Loop B (verify fix loop), updated Step 7 routing, added checkpoint pruning. Both loops use the unified iteration protocol with convergence detection, error classification, checkpoint management, budget tracking, and HITL/AFK mode support.

### Documentation Updates

- `.claude/rules/complexity-gating.md` -- Added Verify fix iterations row to complexity matrix

## Requirements Satisfied

| Requirement | Description                             | Plan(s)             |
| ----------- | --------------------------------------- | ------------------- |
| ITER-01     | Decision-support utilities, skill loop  | 17-01..05           |
| ITER-02     | Multi-signal convergence detection      | 17-01, 17-02        |
| ITER-03     | Iteration limits in ComplexityGate      | 17-01, 17-04        |
| ITER-04     | Checkpoint/rollback via git tags        | 17-01, 17-03        |
| ITER-05     | Rule-based error classification         | 17-01, 17-02        |
| ITER-06     | Cost budget enforcement (80% soft stop) | 17-01, 17-03        |
| ITER-07     | HITL/AFK modes                          | 17-01, 17-04, 17-05 |

## Architecture Patterns Established

1. **Ralph Wiggum Pattern**: Skill IS the loop controller; TypeScript utilities provide decision intelligence via CLI. No standalone loop orchestrator program.
2. **Two-Loop Pipeline**: Loop A (mechanical, harness) + Loop B (semantic, verifier). Both use the same protocol, different triggers and limits.
3. **Multi-Signal Convergence**: 2-of-3 composite rule (error count delta, fingerprint overlap, artifact change delta) prevents false positives from any single signal.
4. **Error Fingerprint Ledger**: SHA-256 hash of file:line:code:normalizedMessage tracks error identity across iterations. Promotion after threshold unchanged appearances.
5. **Checkpoint-per-Iteration**: Lightweight git tags + JSON metadata enable full-iteration rollback without per-plan surgical rollback complexity.

---

_Phase 17 complete: 2026-02-11_
