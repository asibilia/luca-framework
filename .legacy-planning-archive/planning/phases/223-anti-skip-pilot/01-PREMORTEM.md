# Phase 223: Anti-Skip Pilot — Pre-Mortem Risk Brief

**Complexity:** COMPLEX
**Risk Rating:** MEDIUM-HIGH (3 domain-specific scenarios, all mitigatable)

## Failure Scenarios

### 1. Context File as Silent Failure Bus

**Scenario:** `/tmp/pr-address-context.json` has partial write, missing safeParse, or stale data. Downstream sub-skills operate on empty/malformed context with no ledger entry.

**Probability:** MEDIUM
**Impact:** HIGH (silent incorrect behavior)

**Mitigation:** Add `context_version: z.literal(1)` to `PrAddressContextSchema`. Every sub-skill must safeParse on read and treat failed parse as ABORT, not silent fallback.

### 2. DEBATED State Orphan from SKIP_DEBATE Path

**Scenario:** If pr-debate is declared `optional: false` in the DAG but SKIP_DEBATE bypasses it, the gap detector emits a `fail`-severity gap on every clean run without split verdicts. The "0 gaps" verification criterion becomes permanently unachievable.

**Probability:** HIGH (easy to misconfigure)
**Impact:** HIGH (verification always fails)

**Mitigation:** Explicitly set `optional: true` on pr-debate and pr-learn steps in the DAG definition. Add as review checklist item.

### 3. Scope Bleed: Orchestrator Retains Inline Logic

**Scenario:** The thin orchestrator retains `gh api` calls, Task() spawns, or YAML parsing from the original 815-line pr-address instead of purely delegating via Skill(). Sub-skills become untestable by the gap detector.

**Probability:** MEDIUM
**Impact:** MEDIUM (anti-skip architecture partially defeated)

**Mitigation:** Define "zero inline logic" rule: orchestrator contains ONLY Skill() calls, context file reads, and state machine transitions. No `gh api`, no Task(), no template interpolation. Code review must enforce.

## Plan Constraints

1. `PrAddressContextSchema` must include `context_version: z.literal(1)`; failed safeParse = ABORT
2. `pr-debate` and `pr-learn` must be `optional: true` in DAG — review checklist item
3. Orchestrator must pass "zero inline logic" gate: only Skill() calls + context reads + state transitions
