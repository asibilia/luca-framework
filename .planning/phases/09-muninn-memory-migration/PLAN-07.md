---
phase: 09
plan: 07
type: improvement
autonomous: true
wave: 4
depends_on: ["PLAN-01", "PLAN-03", "PLAN-04", "PLAN-05", "PLAN-06"]
---

# Phase 09 Plan 07: Update Rules, Planner Domain, Compiler, and Final Verification

## Objective

Update the 3 rule files that define domain architecture and memory system documentation, update planner domain comments, update compiler memory_tags handling, rebuild all generated outputs, and run comprehensive verification to ensure zero references to the deleted memory domain remain anywhere in the codebase.

This is the final cleanup plan -- it depends on all previous plans and serves as the comprehensive verification gate for the entire phase.

## Context

@src/rules/general/module-boundary.rule.ts
@src/rules/general/domain-architecture.rule.ts
@src/rules/general/lu-workflow.rule.ts
@src/planner/**schemas/planner.schemas.ts
@src/planner/**helpers/cost-model.ts
@src/planner/**helpers/defaults.ts
@src/compilers/**helpers/compile.ts
@.planning/phases/09-muninn-memory-migration/CONTEXT.md
@.planning/phases/09-muninn-memory-migration/09-RESEARCH.md

## Tasks

### 1. Update module-boundary rule

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/rules/general/module-boundary.rule.ts` to remove memory from the dependency tier documentation.

**Changes required:**

1. **Remove memory from T1 Core tier list** (line 22) -- Memory is no longer a domain. T1 Core becomes: context, planner, harness, iteration, observability
2. **Remove the example** `import { compress } from "~/memory"` (line 38-39) -- This was an example of an upward dependency violation. Replace with a different example or remove.
3. **Update the tier map text** to reflect that memory is no longer listed

**Files to create/edit:**

- `src/rules/general/module-boundary.rule.ts`

**Verification:**

- No reference to `memory` as a domain in tier definitions
- Example code does not reference `~/memory`
- `bunx --bun tsc --noEmit` passes

### 2. Update domain-architecture rule

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/rules/general/domain-architecture.rule.ts` to remove memory from Core Domains.

**Changes required:**

1. **Remove memory from Core Domains table** (line 49) -- Remove the row for memory domain
2. **Remove memory from T1 tier list** (line 93) -- T1 becomes: context, planner, harness, iteration, observability

**Files to create/edit:**

- `src/rules/general/domain-architecture.rule.ts`

**Verification:**

- No reference to `memory` as a core domain
- T1 tier list updated
- `bunx --bun tsc --noEmit` passes

### 3. Update lu-workflow rule

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/rules/general/lu-workflow.rule.ts` to document MuninnDB as the memory system.

**Changes required (lines 2, 11, 20, 28, 70-110):**

1. **Update "Two-Tier Memory System" section** -- Replace BRAIN.md/MEMORY.md/WORKING.md descriptions with MuninnDB equivalents:
   - BRAIN.md -> MuninnDB brain tree (`brain:project-identity`)
   - MEMORY.md -> MuninnDB engrams (`pattern:*`, `decision:*`, `pitfall:*`, `preference:*`)
   - WORKING.md -> MuninnDB session engrams (`session:*`)
2. **Update "Cognitive Pre-Flight" section** -- Replace file-based steps with MuninnDB operations:
   - "Load BRAIN.md" -> "Recall brain tree from MuninnDB"
   - "Selective recall from MEMORY.md" -> "Semantic recall from MuninnDB"
   - "Initialize WORKING.md" -> "Initialize MuninnDB session context"
3. **Update any remaining references** to file-based memory throughout the rule text

**Files to create/edit:**

- `src/rules/general/lu-workflow.rule.ts`

**Verification:**

- Memory system documented as MuninnDB-based
- No references to BRAIN.md/MEMORY.md/WORKING.md as operational files
- `bunx --bun tsc --noEmit` passes

### 4. Update planner domain comments

**Type:** auto
**TDD:** false
**Depends on:** none

Update comment-level references in planner domain files:

**planner.schemas.ts (line 163):**

- Old: "calibration over time via MEMORY.md entries"
- New: "calibration over time via MuninnDB engrams"

**cost-model.ts (lines 14, 170, 181, 188):**

- Update JSDoc for `formatCostTableForMemory` -- the function renders markdown for memory storage, still useful for MuninnDB engram content. Update comments to reference MuninnDB.

**defaults.ts (line 89):**

- Old: "calibrated over time via MEMORY.md entries"
- New: "calibrated over time via MuninnDB engrams"

**Files to create/edit:**

- `src/planner/__schemas/planner.schemas.ts`
- `src/planner/__helpers/cost-model.ts`
- `src/planner/__helpers/defaults.ts`
- `src/planner/index.ts` (barrel exports `formatCostTableForMemory` — update comment if needed)

**Verification:**

- No references to MEMORY.md in planner domain
- Function names preserved (formatCostTableForMemory still valid)
- Barrel export comment updated
- `bunx --bun tsc --noEmit` passes

### 5. Update compiler memory_tags handling comment

**Type:** auto
**TDD:** false
**Depends on:** none

Update `src/compilers/__helpers/compile.ts` line 69 comment if it references MEMORY.md. The `cognition.memory_tags` field is still rendered in frontmatter output -- the field still exists, only the semantics changed.

**Files to create/edit:**

- `src/compilers/__helpers/compile.ts`

**Verification:**

- Comment updated if referencing MEMORY.md
- Frontmatter rendering of memory_tags preserved
- `bunx --bun tsc --noEmit` passes

### 6. Rebuild all generated outputs

**Type:** auto
**TDD:** false
**Depends on:** 1, 2, 3, 4, 5

Run `bun run build:all` to regenerate all `.claude/`, `.cursor/`, `.pi/` outputs from the updated source files. This ensures all generated agent/skill/rule markdown reflects the MuninnDB changes.

```bash
bun run build:all
```

**Verification:**

- Build completes without errors
- Generated files in `.claude/`, `.cursor/`, `.pi/` reflect MuninnDB terminology
- No references to `bridge.ts` in generated output

### 7. Run comprehensive codebase verification

**Type:** auto
**TDD:** false
**Depends on:** 6

Run a comprehensive sweep of the entire codebase to verify no operational references to the deleted memory system remain.

```bash
# Verify src/memory/ is gone
ls src/memory/ 2>&1 | grep -q "No such file"

# Check for any remaining bridge.ts references
grep -rn "src/memory/__helpers/bridge.ts" src/ packages/ scripts/

# Check for operational BRAIN.md/MEMORY.md/WORKING.md references
grep -rn "BRAIN.md\|MEMORY.md\|WORKING.md" src/ --include="*.ts" --include="*.sh"

# Verify domain boundary checker
bun run scripts/check-domain-boundaries.ts

# Full typecheck
bunx --bun tsc --noEmit

# Full build
bun run build:all

# Check generated outputs for memory references
grep -rn "bridge.ts" .claude/ .cursor/ .pi/
```

**Verification:**

- `src/memory/` does not exist
- Zero references to `bridge.ts` in source or generated output
- Zero operational references to BRAIN.md/MEMORY.md/WORKING.md as files
- Domain boundary checker passes
- TypeScript compilation passes
- Build completes successfully
- Generated outputs are clean

## Verification

1. All 3 rule files updated to remove memory domain references
2. Planner domain comments reference MuninnDB
3. Compiler memory_tags handling preserved with updated comments
4. `bun run build:all` succeeds and generates clean output
5. Zero references to `bridge.ts` anywhere in codebase
6. Zero operational references to BRAIN.md/MEMORY.md/WORKING.md
7. Domain boundary checker passes without memory domain
8. `bunx --bun tsc --noEmit` passes

## Success Criteria

- The codebase has zero structural, operational, or documentation references to the deleted file-based memory system
- All rules correctly document MuninnDB as the memory backend
- All generated outputs (.claude/, .cursor/, .pi/) reflect the migration
- Full build pipeline passes end-to-end
- Domain boundary checker confirms valid architecture without memory domain

## Output Specification

**Files modified:**

- `src/rules/general/module-boundary.rule.ts`
- `src/rules/general/domain-architecture.rule.ts`
- `src/rules/general/lu-workflow.rule.ts`
- `src/planner/__schemas/planner.schemas.ts`
- `src/planner/__helpers/cost-model.ts`
- `src/planner/__helpers/defaults.ts`
- `src/compilers/__helpers/compile.ts`

**Files regenerated:**

- All files in `.claude/agents/`, `.claude/skills/`, `.claude/rules/`
- All files in `.cursor/agents/`, `.cursor/skills/`, `.cursor/rules/`
- All files in `.pi/agents/`, `.pi/skills/`, `.pi/rules/`
