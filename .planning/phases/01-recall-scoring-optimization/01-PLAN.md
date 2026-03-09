---
id: "01"
title: "Recall Scoring Optimization"
phase: 01
wave: 1
complexity: SIMPLE
tasks:
  - id: "01.1"
    title: "Add complexity-gated recall depth to selective_recall"
    file: "src/agents/general/lu-cognition.agent.ts"
    wave: 1
  - id: "01.2"
    title: "Add milestone decay scoring to selective_recall"
    file: "src/agents/general/lu-cognition.agent.ts"
    wave: 1
  - id: "01.3"
    title: "Add recallDepth to config.json complexity matrix"
    file: ".planning/config.json"
    wave: 1
  - id: "01.4"
    title: "Update success_criteria to reflect new behavior"
    file: "src/agents/general/lu-cognition.agent.ts"
    wave: 1
---

# Plan 01: Recall Scoring Optimization

## Objective

Reduce token overhead by (1) gating recall depth on task complexity and (2) aggressively scoping recall entries to the current milestone via decay scoring.

## Context

- `src/agents/general/lu-cognition.agent.ts` — target file (agent prompt text)
- `.planning/config.json` — config addition
- Research: `.planning/phases/01-recall-scoring-optimization/01-RESEARCH.md`
- Decisions: `.planning/phases/01-recall-scoring-optimization/01-CONTEXT.md`

## Wave 1: All Tasks (no internal dependencies)

### Task 01.1 — Add complexity-gated recall depth to selective_recall

**Goal:** Insert a complexity check BEFORE the existing tier-scaled entry limits (lines 331-339 in lu-cognition.agent.ts) so that MODERATE tasks are capped at 3 entries regardless of tier.

**What to do:**

In the `selective_recall` step content string, find the text block starting with `**Tier-Scaled Entry Limits`. Insert BEFORE it a new section for complexity-gated recall depth:

```
**Complexity-Gated Recall Depth:**

1. Read recallDepth from complexity matrix for current complexity level
2. IF recallDepth == 0: skip recall entirely (lite mode handles TRIVIAL/SIMPLE)
3. IF recallDepth is a number (e.g., 3): cap entries at recallDepth regardless of tier
4. IF recallDepth is null: use tier-scaled defaults below
```

Then update the tier-scaled limits heading to: `**Tier-Scaled Entry Limits (fallback when recallDepth is null):**`

**Verification:**

- [ ] Complexity-gated depth section appears before tier-scaled limits
- [ ] MODERATE tasks will be capped at 3 entries via config
- [ ] COMPLEX/CRITICAL use tier defaults (null in config)
- [ ] File passes typecheck

### Task 01.2 — Add milestone decay scoring to selective_recall

**Goal:** Add milestone proximity scoring multipliers after the existing "Recency boost" section in the scoring pseudocode (lines 289-323).

**What to do:**

In the `selective_recall` step content string, find the "Recency boost" block ending with `score += 0.5`. Insert AFTER it a new milestone proximity scoring section:

```
# Milestone proximity scoring (NEW)
current_milestone = resolve from STATE.md "Current Milestone" field
if entry has milestone tag:
    if entry.milestone == current_milestone:
        score *= 1.5  # Current milestone boost
    elif entry.milestone == previous_milestone (N-1):
        score *= 1.0  # Previous milestone, neutral
    else:
        score *= 0.25  # Old milestone (N-2+), aggressive decay
else:
    score *= 0.5  # No milestone tag (legacy entry), deprioritize
```

**Verification:**

- [ ] Milestone scoring section appears after Recency boost
- [ ] Current milestone gets 1.5x, N-1 gets 1.0x, N-2+ gets 0.25x, legacy gets 0.5x
- [ ] File passes typecheck

### Task 01.3 — Add recallDepth to config.json complexity matrix

**Goal:** Add `recallDepth` field to each complexity level in `.planning/config.json`.

**What to do:**

In the `complexity.matrix` section, add `recallDepth` to each level:

- TRIVIAL: `"recallDepth": 0`
- SIMPLE: `"recallDepth": 0`
- MODERATE: `"recallDepth": 3`
- COMPLEX: `"recallDepth": null`
- CRITICAL: `"recallDepth": null`

**Verification:**

- [ ] Each complexity level has recallDepth field
- [ ] TRIVIAL/SIMPLE = 0, MODERATE = 3, COMPLEX/CRITICAL = null
- [ ] JSON is valid

### Task 01.4 — Update success_criteria to reflect new behavior

**Goal:** Update the success_criteria section (~line 751) to document the new complexity-gated behavior.

**What to do:**

Find: `- [ ] Entry count scaled by effective tier (T1: 3-5, T2: 5-7, T3: 7-10)`

Replace with:

```
- [ ] Entry count gated by complexity (MODERATE: max 3) then scaled by tier (T1: 3-5, T2: 5-7, T3: 7-10)
- [ ] Milestone proximity scoring applied (current: 1.5x, N-1: 1.0x, N-2+: 0.25x, legacy: 0.5x)
```

**Verification:**

- [ ] Success criteria reflect both complexity gating and milestone scoring
- [ ] File passes typecheck

## Success Criteria

- [ ] lu-cognition.agent.ts has complexity-gated recall depth pseudocode
- [ ] lu-cognition.agent.ts has milestone decay scoring pseudocode
- [ ] config.json has recallDepth for all 5 complexity levels
- [ ] success_criteria updated to reflect new behavior
- [ ] All files pass typecheck: `bunx --bun tsc --noEmit`
- [ ] Changes committed to branch
