---
plan: 17-05
title: Orchestrator Loop Protocol & Skill Update
status: complete
duration: ~5min
---

# Plan 17-05 Summary: Orchestrator Loop Protocol & Skill Update

## Result: PASS

All 4 tasks completed successfully.

## What Was Done

### Task 1: Replaced Step 6.6 with Loop A (Harness Fix Loop)

- `.claude/skills/lu-execute-phase/SKILL.md`: Replaced the entire existing Step 6.6 (~80-line Failure-to-Fix Loop) with the new Loop A protocol (~260 lines)
  - **6.6.1 Initialize Loop A**: Reads complexity level, harnessFixIterations, iteration config (default_mode, soft_stop_percent, stale_threshold, promotion_threshold), creates budget state
  - **6.6.2 Loop A Iteration Cycle**: 7-step cycle (A-G):
    - Step A: Budget pre-check via budget.ts
    - Step B: Classify errors via classifier.ts (correctable/transient/permanent)
    - Step C: Convergence check via convergence.ts (2-of-3 stale rule, skip iteration 1)
    - Step D: Create checkpoint via checkpoint.ts (git tag + JSON metadata)
    - Step E: HITL/AFK decision point (4-choice menu in HITL mode)
    - Step F: Spawn executor with fix context (excludes permanent errors)
    - Step G: Re-run harness, advance budget
  - **6.6.3 Loop A Termination**: Display summary, pass results to Step 7

### Task 2: Updated Step 7 routing for Loop B integration

- `.claude/skills/lu-execute-phase/SKILL.md`: Modified the Step 7 verifier routing block:
  - `passed` -> continue to Step 8 (Code Quality Review)
  - `human_needed` -> present items, get approval, then continue to Step 8
  - `gaps_found` -> proceed to Step 7.5 (Loop B: Verify Fix Loop)
  - Added note: Loop B attempts automated gap resolution before offering `/lu-plan-phase --gaps`

### Task 3: Added Step 7.5 — Loop B (Verify Fix Loop)

- `.claude/skills/lu-execute-phase/SKILL.md`: Inserted new Step 7.5 after Step 7 (~160 lines)
  - **7.5.1 Initialize Loop B**: Reads verifyFixIterations from complexity matrix, creates verify budget
  - **7.5.2 Extract Gap-Targeted Plans**: Parses VERIFICATION.md for source_plan attribution, fallback to all plans
  - **7.5.3 Loop B Iteration Cycle**: Steps B-A through B-F:
    - B-A: Budget pre-check
    - B-B: Spawn targeted executors (parallel, only plans with gaps)
    - B-C: Re-run harness (catch mechanical breakage)
    - B-D: Re-run verifier
    - B-E: Convergence check (gap count as error signal)
    - B-F: Checkpoint & HITL
  - **7.5.4 Loop B Termination**: Display summary, route by outcome

### Task 4: Renumbered subsequent steps and added checkpoint pruning

- `.claude/skills/lu-execute-phase/SKILL.md`:
  - Renumbered: 7.5 (Code Quality Review) -> 8, 7.6 -> 8.1, 8 -> 9, 9 -> 10, new 10.5 (Checkpoint Cleanup), 10 -> 11, 11 -> 12, 12 -> 13
  - Added Step 10.5 (Checkpoint Cleanup): `bun run src/iteration/checkpoint.ts prune --phase={phase_number}` after verification passes

## Verification

- [x] Step 6.6 is completely replaced with Loop A protocol (no remnant of old failure-to-fix loop)
- [x] Loop A calls src/iteration/ CLI utilities: classifier.ts, convergence.ts, checkpoint.ts, budget.ts
- [x] Loop A respects harnessFixIterations from ComplexityGate
- [x] Loop A initializes from config.json iteration section (mode, soft_stop_percent, stale_threshold, promotion_threshold)
- [x] Loop A supports both AFK and HITL modes with 4-choice menu
- [x] Loop A creates checkpoints at each iteration
- [x] Loop A excludes permanent errors from executor fix context
- [x] Step 7.5 (Loop B) exists after Step 7
- [x] Loop B re-executes only plans with source_plan gaps (or all plans as fallback)
- [x] Loop B re-runs harness after executor fixes to catch mechanical breakage
- [x] Loop B re-runs verifier after fixes to check if gaps are resolved
- [x] Loop B respects verifyFixIterations from ComplexityGate
- [x] Step 7 routing updated: gaps_found routes to Loop B, not directly to re-planning
- [x] Subsequent steps renumbered correctly (8, 8.1, 9, 10, 10.5, 11, 12, 13)
- [x] Checkpoint pruning added to phase completion (Step 10.5)
- [x] SKILL.md compiles as valid markdown with no broken formatting
