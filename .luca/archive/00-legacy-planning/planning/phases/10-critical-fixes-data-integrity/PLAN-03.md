---
phase: 10
plan: 3
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 10 Plan 3: Prompt Text and Dead Reference Cleanup

## Objective

Fix three issues in agent/skill prompt text: replace the phantom `tailwind-auditor` agent reference with the actual `ui` agent, update lu-learner's stale `PROCEDURES.md` references to use MuninnDB, and remove the legacy model profile table from phase-execute that predates the Phase 6 model routing redesign.

## Context

@src/skills/general/phase-execute.skill.ts
@src/agents/general/lu-learner.agent.ts
@.planning/v3.0.0-MILESTONE-AUDIT.md
@src/complexity/\_\_helpers/model-routing.ts

## Tasks

### 1. Replace tailwind-auditor with ui agent (M2)

**Type:** auto
**TDD:** false
**Depends on:** none

**Problem:** `src/skills/general/phase-execute.skill.ts` references `tailwind-auditor` as a sub-agent in four locations:

1. Line ~38: Agent list bullet point
2. Line ~206: Legacy model lookup table row
3. Line ~1470: Example `source_agent` value in code review output format
4. Line ~1828: Verification checklist

The `tailwind-auditor` agent does not exist in source or generated output. The actual agent that handles styling/UI review is `ui`, which is already defined in `src/agents/general/ui.agent.ts` and listed in `MODEL_ROUTING_TABLE`.

**Fix:** Replace all instances of `tailwind-auditor` with `ui` in the phase-execute skill file.

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts`

**Verification:**

- `grep "tailwind-auditor" src/skills/general/phase-execute.skill.ts` returns no results
- `grep -c "\\bui\\b" src/skills/general/phase-execute.skill.ts` returns at least the 4 replacement locations
- `bunx --bun tsc --noEmit` passes

### 2. Update lu-learner PROCEDURES.md references to MuninnDB (M3)

**Type:** auto
**TDD:** false
**Depends on:** none

**Problem:** `src/agents/general/lu-learner.agent.ts` references `.planning/PROCEDURES.md` for procedure extraction in multiple locations:

1. Line ~55: Role description mentioning writing procedures to PROCEDURES.md
2. Line ~396: Dedup check referencing PROCEDURES.md
3. Lines ~399-405: Step-by-step instructions to read/append to PROCEDURES.md

The `.planning/PROCEDURES.md` file no longer exists after the MuninnDB migration (Phase 9). Procedure storage should use MuninnDB.

**Fix:** Update the procedure extraction section to use MuninnDB recall and remember operations instead of file-based PROCEDURES.md operations:

1. **Line ~55 (role section):** Change "Extract step sequences as learned procedures to PROCEDURES.md" to "Store validated step sequences as procedure engrams in MuninnDB"

2. **Lines ~396-405 (procedure extraction logic):** Replace the PROCEDURES.md read/write steps with MuninnDB operations:
   - Replace "Does it already exist in PROCEDURES.md?" with "Does it already exist in MuninnDB? (recall with concept: procedure:\*)"
   - Replace "Read .planning/PROCEDURES.md" with "Recall existing procedures from MuninnDB: mcp**muninn**muninn_recall(vault='default', context=['procedure extraction', task tags])"
   - Replace "Serialize and append to PROCEDURES.md Active section" with "Store as MuninnDB engram: mcp**muninn**muninn_remember(vault='default', concept='procedure:{title}', content=serialized procedure)"

**Files to edit:**

- `src/agents/general/lu-learner.agent.ts`

**Verification:**

- `grep "PROCEDURES.md" src/agents/general/lu-learner.agent.ts` returns no results
- `grep -c "MuninnDB\|muninn" src/agents/general/lu-learner.agent.ts` shows MuninnDB references exist
- `bunx --bun tsc --noEmit` passes

### 3. Remove legacy model profile table from phase-execute (L16)

**Type:** auto
**TDD:** false
**Depends on:** Task 1 (tailwind-auditor replacement should happen first to avoid editing the same area twice)

**Problem:** Lines ~197-226 of `src/skills/general/phase-execute.skill.ts` contain a legacy "Model lookup table" with quality/balanced/budget columns that predates the Phase 6 model routing redesign. The comment on line ~212 even acknowledges it as a "Current Limitation" of Cursor. This table is dead documentation since model routing now uses `resolveModelForAgent()` from `MODEL_ROUTING_TABLE`.

**Fix:** Remove the entire legacy model lookup table section (lines ~197-226), including:

- The `MODEL_PROFILE` bash grep command
- The 10-row model lookup table
- The "Current Limitation" note
- The "Current model variable values" block

Replace with a brief reference to the actual routing system:

```
### 0. Resolve Model Routing

Model routing is handled by \`resolveModelForAgent(agentName, complexity)\` from \`src/complexity/__helpers/model-routing.ts\`. See the complexity-gating rule for the routing table summary. No manual profile selection is needed.
```

**Files to edit:**

- `src/skills/general/phase-execute.skill.ts` (lines ~191-226)

**Verification:**

- `grep "quality.*balanced.*budget" src/skills/general/phase-execute.skill.ts` returns no results
- `grep "MODEL_PROFILE" src/skills/general/phase-execute.skill.ts` returns no results
- `grep "resolveModelForAgent" src/skills/general/phase-execute.skill.ts` returns the new reference
- `bunx --bun tsc --noEmit` passes

## Verification

```bash
# TypeScript compilation
bunx --bun tsc --noEmit

# Confirm M2: no tailwind-auditor references
grep "tailwind-auditor" src/skills/general/phase-execute.skill.ts
# Expected: no output

# Confirm M3: no PROCEDURES.md references
grep "PROCEDURES.md" src/agents/general/lu-learner.agent.ts
# Expected: no output

# Confirm L16: legacy table removed
grep "quality.*balanced.*budget" src/skills/general/phase-execute.skill.ts
# Expected: no output

# Confirm new routing reference exists
grep "resolveModelForAgent" src/skills/general/phase-execute.skill.ts
# Expected: shows the new reference
```

## Success Criteria

- Zero references to phantom `tailwind-auditor` agent in phase-execute
- Zero references to nonexistent `PROCEDURES.md` in lu-learner
- Legacy model profile table removed from phase-execute, replaced with routing system reference
- All changes are in `src/` source files (generated outputs updated by user via `bun run build:all`)
- TypeScript compilation passes

## Output Specification

- 2 edited source files (`src/skills/general/phase-execute.skill.ts`, `src/agents/general/lu-learner.agent.ts`)
- User must run `bun run build:all` after this plan to regenerate `.claude/`, `.cursor/`, `.pi/` outputs
