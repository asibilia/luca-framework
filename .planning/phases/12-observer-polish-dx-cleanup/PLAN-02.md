---
phase: 12
plan: 2
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 12 Plan 2: DX Cleanup — Cold Isolation Extraction + Todos Route Bun API

## Objective

Extract the duplicated 637-character cold isolation instruction block from 5 reviewer agents into a shared constant, and migrate the todos API route from `node:fs/promises` readFile to `Bun.file()` API. Both are DX convention alignment fixes with zero behavioral change.

## Context

@src/agents/general/dx-advocate.agent.ts — Has cold isolation block (lines 32-48)
@src/agents/general/code-simplifier.agent.ts — Has identical cold isolation block
@src/agents/general/code-architect.agent.ts — Has identical cold isolation block
@src/agents/general/performance-auditor.agent.ts — Has identical cold isolation block
@src/agents/general/security-auditor.agent.ts — Has identical cold isolation block
@src/agents/luca/lu-verifier.agent.ts — Has DIFFERENT (WARM) isolation block, do NOT change
@packages/luca-observer/app/api/todos/route.ts — Uses node:fs/promises readFile
@.planning/phases/12-observer-polish-dx-cleanup/12-RESEARCH.md — Full research

## Tasks

### 1. Extract cold isolation block to shared constant

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/agents/__helpers/cold-isolation-block.ts` containing the shared cold isolation instruction text. Update all 5 reviewer agents to import and interpolate this constant instead of inlining the block.

**Steps:**

1. Create `src/agents/__helpers/cold-isolation-block.ts` with:
   - JSDoc documenting purpose and which agents use it
   - Export `COLD_ISOLATION_BLOCK` as a const string containing the full `<context_isolation>...</context_isolation>` XML block
2. In each of the 5 reviewer agents, replace the inline cold isolation text (lines 32-48 approximately) with an import of `COLD_ISOLATION_BLOCK` and string interpolation: `${COLD_ISOLATION_BLOCK}`
3. Re-export `COLD_ISOLATION_BLOCK` from `src/agents/index.ts` barrel (or from `src/agents/__helpers/` — follow existing barrel pattern)

**Do NOT modify:**

- `src/agents/luca/lu-verifier.agent.ts` — uses WARM isolation, different block

**Files to create:**

- `src/agents/__helpers/cold-isolation-block.ts`

**Files to edit:**

- `src/agents/general/dx-advocate.agent.ts`
- `src/agents/general/code-simplifier.agent.ts`
- `src/agents/general/code-architect.agent.ts`
- `src/agents/general/performance-auditor.agent.ts`
- `src/agents/general/security-auditor.agent.ts`
- `src/agents/index.ts` (add re-export if following barrel pattern)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 5 agents import from `cold-isolation-block.ts`
- The inline text is completely removed from all 5 agent files
- `lu-verifier.agent.ts` is unchanged
- Diff of each agent's compiled output should produce identical content (the string value hasn't changed, only the source of it)

### 2. Migrate todos route readFile to Bun.file() API

**Type:** auto
**TDD:** false
**Depends on:** none

Replace `readFile` from `node:fs/promises` with `Bun.file().text()` in the todos API route. Keep `readdir` from `node:fs/promises` since Bun has no direct replacement.

**Steps:**

1. In `packages/luca-observer/app/api/todos/route.ts`:
   - Remove `readFile` from the `node:fs/promises` import (keep `readdir`)
   - Replace `await readFile(join(dirPath, file), "utf-8")` with `await Bun.file(join(dirPath, file)).text()`
2. Verify the function signature and return type remain identical

**Files to edit:**

- `packages/luca-observer/app/api/todos/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `readFile` no longer imported from `node:fs/promises`
- `Bun.file()` used for file reads
- `readdir` still imported from `node:fs/promises` (no Bun alternative)
- Function behavior unchanged (same TodoResponse shape returned)

### 3. Verify and document

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Run full typecheck to confirm all changes are sound. Verify no unintended changes to other files.

**Steps:**

1. Run `bunx --bun tsc --noEmit` across the full project
2. Verify git diff shows only the expected files changed
3. Confirm the cold isolation block text in the new shared file matches the original text exactly (character-for-character)

**Verification:**

- `bunx --bun tsc --noEmit` passes with zero errors
- git diff shows only the 7-8 expected files modified/created
- No behavioral changes (pure refactor)

## Verification

1. `bunx --bun tsc --noEmit` passes with no errors
2. Cold isolation block exists in exactly 1 location (the shared constant), referenced by 5 agents
3. `lu-verifier.agent.ts` untouched (WARM isolation preserved)
4. Todos route uses `Bun.file()` for reads, `readdir` from `node:fs/promises` for directory listing
5. No behavioral changes in any modified file

## Success Criteria

- 637 characters of duplicated text reduced to 1 shared constant + 5 imports
- Todos route fully aligned with Bun API preference (CLAUDE.md convention)
- Zero type errors across the project

## Output Specification

- Created: `src/agents/__helpers/cold-isolation-block.ts`
- Modified: 5 reviewer agent files (cold isolation import)
- Modified: `packages/luca-observer/app/api/todos/route.ts` (Bun.file migration)
- Modified: `src/agents/index.ts` (barrel re-export, if applicable)
