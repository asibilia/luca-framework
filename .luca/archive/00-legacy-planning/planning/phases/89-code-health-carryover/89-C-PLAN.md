---
id: 89-C
title: "Tighten harness and verify iteration caps"
phase: 89
wave: 1
complexity: SIMPLE
---

# 89-C: Tighten Harness and Verify Iteration Caps

## Objective

Reduce harness fix iteration and verify fix iteration limits across the complexity matrix to prevent excessive retry loops that waste context budget without converging. Based on operational experience, the current caps are too generous for MODERATE/COMPLEX/CRITICAL levels.

### Target Changes

| Level    | harnessFixIterations | verifyFixIterations |
| -------- | -------------------- | ------------------- |
| TRIVIAL  | 1 (unchanged)        | 0 (unchanged)       |
| SIMPLE   | 2 (unchanged)        | 1 (unchanged)       |
| MODERATE | 3 -> **2**           | 1 (unchanged)       |
| COMPLEX  | 3 -> **2**           | 2 -> **1**          |
| CRITICAL | 5 -> **3**           | 3 -> **2**          |

## Context

@file src/complexity/**helpers/defaults.ts (DEFAULT_COMPLEXITY_MATRIX — source of truth)
@file src/complexity/**schemas/complexity.schemas.ts (ComplexityGateSchema — schema definition)
@file .planning/config.json (project config — complexity.matrix section)
@file .claude/rules/complexity-gating.md (documentation of the matrix)
@file src/hooks/pi-extensions/luca-complexity.ts (GATING_MATRIX — Pi extension copy)
@file src/hooks/pi-extensions/\_\_helpers/session-init.ts (session init default config)
@file src/hooks/scripts/session-start.sh (session start inline matrix)
@file src/skills/general/phase-execute.skill.ts (reads caps at runtime)
@file src/agents/luca/lu-executor.agent.ts (references caps in prompt)

### Files That Need Updates (7 locations)

The iteration caps are defined/duplicated in these locations:

1. **`src/complexity/__helpers/defaults.ts`** — `DEFAULT_COMPLEXITY_MATRIX` (primary source of truth)
2. **`.planning/config.json`** — `complexity.matrix` section (project config)
3. **`.claude/rules/complexity-gating.md`** — Complexity Matrix table (documentation)
4. **`src/hooks/pi-extensions/luca-complexity.ts`** — `GATING_MATRIX` constant (Pi extension)
5. **`src/hooks/pi-extensions/__helpers/session-init.ts`** — inline matrix in default config
6. **`src/hooks/scripts/session-start.sh`** — inline matrix in session start script
7. **`src/agents/luca/lu-executor.agent.ts`** — mentions "Default: 3 iterations" in prompt text

### Files That Do NOT Need Changes

- `src/complexity/__schemas/complexity.schemas.ts` — Schema uses `z.number().int().positive()` for harnessFixIterations and `z.number().int().nonnegative()` for verifyFixIterations. These constraints remain valid for all new values (2, 1, 3 are all positive/nonnegative).
- `src/skills/general/phase-execute.skill.ts` — Reads caps dynamically from config at runtime. No hardcoded values to change.

## Tasks

### Task 1: Update source of truth — defaults.ts

**Goal:** Change iteration caps in `DEFAULT_COMPLEXITY_MATRIX`
**Files:** `src/complexity/__helpers/defaults.ts`
**Steps:**

1. Change MODERATE `harnessFixIterations` from 3 to 2
2. Change COMPLEX `harnessFixIterations` from 3 to 2
3. Change COMPLEX `verifyFixIterations` from 2 to 1
4. Change CRITICAL `harnessFixIterations` from 5 to 3
5. Change CRITICAL `verifyFixIterations` from 3 to 2

**Verification:**

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Values match the target table above

### Task 2: Update project config — config.json

**Goal:** Sync iteration caps in `.planning/config.json` with defaults.ts
**Files:** `.planning/config.json`
**Steps:**

1. Change MODERATE `harnessFixIterations` from 3 to 2
2. Change COMPLEX `harnessFixIterations` from 3 to 2
3. Change COMPLEX `verifyFixIterations` from 2 to 1
4. Change CRITICAL `harnessFixIterations` from 5 to 3
5. Change CRITICAL `verifyFixIterations` from 3 to 2

**Verification:**

- [ ] JSON is valid (no syntax errors)
- [ ] Values match defaults.ts

### Task 3: Update documentation — complexity-gating.md

**Goal:** Update the Complexity Matrix table in the rule documentation
**Files:** `.claude/rules/complexity-gating.md`
**Steps:**

1. Update the "Harness fix iterations" row: MODERATE 3->2, COMPLEX 3->2, CRITICAL 5->3
2. Update the "Verify fix iterations" row: COMPLEX 2->1, CRITICAL 3->2

**Verification:**

- [ ] Table values match defaults.ts

### Task 4: Update Pi extension copies

**Goal:** Sync iteration caps in Pi extension files
**Files:**

- `src/hooks/pi-extensions/luca-complexity.ts` (GATING_MATRIX)
- `src/hooks/pi-extensions/__helpers/session-init.ts` (inline matrix)
- `src/hooks/scripts/session-start.sh` (inline matrix)

**Steps:**

1. In `luca-complexity.ts`, update MODERATE/COMPLEX/CRITICAL `harness_fix_iterations` and `verify_fix_iterations`
2. In `session-init.ts`, update MODERATE/COMPLEX/CRITICAL `harnessFixIterations` and `verifyFixIterations` (note: this file uses camelCase)
3. In `session-start.sh`, update the inline JavaScript matrix values

**Verification:**

- [ ] All three files have consistent values matching defaults.ts
- [ ] `bunx --bun tsc --noEmit` passes

### Task 5: Update agent prompt reference

**Goal:** Fix the hardcoded "Default: 3 iterations" text in lu-executor.agent.ts
**Files:** `src/agents/luca/lu-executor.agent.ts`
**Steps:**

1. Search for "Default: 3 iterations" or similar hardcoded iteration references
2. Change to reference the complexity matrix dynamically, or update the text to say "Uses iteration limit from complexity matrix" instead of a specific number

**Verification:**

- [ ] No hardcoded iteration counts remain in agent prompts
- [ ] `bunx --bun tsc --noEmit` passes

### Task 6: Run tests and rebuild

**Goal:** Verify no tests break and built outputs stay in sync
**Files:** All
**Steps:**

1. Run `bun test` — check for any tests that assert specific iteration values
2. Run `bunx --bun tsc --noEmit` — type safety
3. Run `bun run build:all` — rebuild compiled outputs
4. Run `bun run check:drift` — ensure built outputs match source

**Verification:**

- [ ] `bun test` passes (no regressions from cap changes)
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun run check:drift` passes (no drift between source and built outputs)

## Success Criteria

- [ ] MODERATE harnessFixIterations = 2 everywhere (was 3)
- [ ] COMPLEX harnessFixIterations = 2, verifyFixIterations = 1 everywhere (was 3, 2)
- [ ] CRITICAL harnessFixIterations = 3, verifyFixIterations = 2 everywhere (was 5, 3)
- [ ] All 7 locations are in sync
- [ ] `bun test` passes
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `bun run check:drift` passes
