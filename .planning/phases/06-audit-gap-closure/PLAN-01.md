---
phase: 06
plan: 01
title: Audit Gap Closure
wave: 1
complexity: SIMPLE
gap_closure: true
todos: [108, 109, 110]
---

# Plan 01 — Audit Gap Closure

## Objective

Fix the CRITICAL integration bug (PREMORTEM_COMPLETE bridge command), align metric key naming, and apply mechanical code quality fixes identified during the v4.0.0 milestone audit.

## Context

- @.planning/v4.0.0-MILESTONE-AUDIT.md (audit report with all gaps)
- @src/skills/general/phase-discuss.skill.ts (GAP 1: wrong bridge command)
- @src/agents/luca/lu-process-data.agent.ts (GAP 2: metric key mismatch + section ordering)
- @packages/luca-framework/src/state/guards.ts (duplicate imports + bracket notation)
- @packages/luca-framework/src/state/snapshot.ts (duplicate imports)
- @src/agents/luca/lu-premortem.agent.ts (out-of-vocabulary memory tags)

## Tasks

### Task 1: Fix PREMORTEM_COMPLETE bridge command (#108)

**File:** `src/skills/general/phase-discuss.skill.ts` line 323
**Change:** Replace `emit-event --type=PREMORTEM_COMPLETE` with `transition --event=PREMORTEM_COMPLETE`
**Why:** `emit-event` is observability telemetry, `transition` advances the state machine. Without this fix, the discussing state stalls after pre-mortem approval.

**Verification:** The line reads `transition --event=PREMORTEM_COMPLETE` after edit.

### Task 2: Align metric key naming (#109)

**File:** `src/agents/luca/lu-process-data.agent.ts`
**Change:** Rename all occurrences of `outcome-completion-rate` to `outcome-completion`
**Why:** outcome.skill stores metrics under `metric:outcome-completion`. lu-process-data uses `metric:outcome-completion-rate`. The mismatch breaks the aggregate connection.

**Verification:** No occurrences of `outcome-completion-rate` remain in the file.

### Task 3: Merge duplicate imports in guards.ts (#110a)

**File:** `packages/luca-framework/src/state/guards.ts` lines 14-15
**Change:** Merge `import { shouldStartIteration } from "./utils/budget-utils"` and `import { budgetStateSchema } from "./utils/budget-utils"` into a single import.

**Verification:** Single import from `./utils/budget-utils`.

### Task 4: Fix bracket notation in guards.ts (#110b)

**File:** `packages/luca-framework/src/state/guards.ts` lines 285, 296
**Change:** Replace `context.gates["premortem"]` with `context.gates.premortem` and `context.gates["process_data"]` with `context.gates.process_data`.

**Verification:** No bracket notation with string literals in the guard functions.

### Task 5: Merge duplicate imports in snapshot.ts (#110c)

**File:** `packages/luca-framework/src/state/snapshot.ts` lines 12-13
**Change:** Merge two `import type` from `"./types"` into a single import.

**Verification:** Single type import from `"./types"`.

### Task 6: Fix lu-premortem memory tags (#110d)

**File:** `src/agents/luca/lu-premortem.agent.ts` line 18
**Change:** Replace `"failures"` with `"pitfalls"` and `"risks"` with `"planning"` in memory_tags array.

**Verification:** memory_tags array contains only in-vocabulary tags.

### Task 7: Fix lu-process-data section ordering (#110e)

**File:** `src/agents/luca/lu-process-data.agent.ts`
**Change:** Swap order values so aggregate_metrics has `order: 4` and output_format has `order: 5`.

**Verification:** Sections are ordered sequentially (1-5) without gaps or swaps.

## Success Criteria

- [ ] PREMORTEM_COMPLETE uses `transition` command (not `emit-event`)
- [ ] Metric key is `outcome-completion` everywhere (not `outcome-completion-rate`)
- [ ] No duplicate imports in guards.ts or snapshot.ts
- [ ] Dot notation used for gate checks in guards.ts
- [ ] lu-premortem memory tags are in vocabulary
- [ ] lu-process-data sections ordered correctly
- [ ] TypeScript compiles cleanly (`bunx --bun tsc --noEmit`)
