# PLAN-145-3 Summary: Revise Stale Engram Pruning in milestone-complete

## Result: COMPLETE

**Phase:** 145
**Plan:** 3
**Wave:** 2
**Duration:** ~3 minutes

## Changes Made

### Task 1: Revise stale detection threshold

- Replaced OR-based stale detection (3+ recalls with low usefulness OR never recalled) with conservative BOTH-conditions threshold
- New definition: 5+ recalls with 0 positive feedback AND 3+ milestones with no positive feedback (BOTH required)
- Unified recall query into single deep-mode call with rolling window over last 10 phase metrics
- **Commit:** `5feb0b05`

### Task 2: Add human review checkpoint

- Replaced automatic prune/evolve/consolidate decision with human review gate
- Developer sees ASCII table with concept, recalls, positive count, milestones dormant
- Three options: [Y] Prune all, [N] Keep all, [S] Select individually
- No deletion occurs without developer approval
- **Commit:** `13b1533a`

### Task 3: Replace automatic prune with forget-after-approval

- Removed 3-way decision logic (forget/evolve/consolidate per stale engram)
- Stale engrams are now deleted via `muninn_forget` only (after human approval)
- Documented soft-delete with 7-day recovery window via `muninn_restore`
- Clarified that evolution is reserved for still-useful engrams needing content updates

### Task 4: Add muninn_consolidate call

- Added section "5. Consolidate near-duplicates" that runs `muninn_consolidate` at every milestone boundary
- Runs regardless of whether stale engrams were found or pruned
- Runs AFTER pruning to avoid consolidating just-deleted engrams
- **Commit (Tasks 3+4):** `69ee4711`

### Task 5: Update pruning report and success criteria

- Pruning report now includes: stale_detected, human_approved_for_deletion, forgotten, consolidated, total_engrams_analyzed, stale_threshold
- Added 3 new success criteria entries: stale engram developer review, near-duplicate consolidation, pruning report storage
- **Commit:** `a44f1708`

## Files Modified

- `src/skills/general/milestone-complete.skill.ts` — Revised Step 0.5 (stale detection, human review, forget-after-approval, consolidation, pruning report, success criteria)

## Verification

- `bunx --bun tsc --noEmit` passes with no errors
- Complete Step 0.5 flow verified:
  1. Recall engrams + metrics for rolling window (deep mode, limit 100)
  2. Compute staleness using BOTH-conditions threshold (5+ recalls, 0 positive, 3+ milestones dormant)
  3. Display stale engrams to developer with [Y]/[N]/[S] options
  4. Delete approved engrams via muninn_forget (soft-delete documented)
  5. Run muninn_consolidate for near-duplicate merging
  6. Store pruning report as metric engram
- No remnants of old threshold (3+ recalls OR never recalled) remain

## Deviations

- **Tasks 3 and 4 combined into a single commit**: The old section 4 (reporting) was replaced as a single coherent block that included both the new prune-after-approval logic (Task 3), the consolidation step (Task 4), and the updated report format. This was done because the sections are sequential and the replacement was naturally atomic. Both tasks are fully satisfied.

## Success Criteria Verification

| Criteria                                                                                     | Status |
| -------------------------------------------------------------------------------------------- | ------ |
| Stale threshold matches CONTEXT.md (5+ recalls, 0 positive AND 3+ milestones, BOTH required) | PASS   |
| Human review checkpoint exists before deletion                                               | PASS   |
| Three approval options: prune all, keep all, select individually                             | PASS   |
| muninn_forget used for deletion (not evolve for stale)                                       | PASS   |
| Soft-delete / 7-day recovery documented                                                      | PASS   |
| muninn_consolidate runs at every milestone boundary                                          | PASS   |
| Pruning report stored as MuninnDB metric engram                                              | PASS   |
| Success criteria section updated                                                             | PASS   |
