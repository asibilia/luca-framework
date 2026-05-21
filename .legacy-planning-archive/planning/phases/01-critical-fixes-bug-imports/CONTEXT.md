# Phase 1 Context: Critical Fixes + Bug + Import Violations

## Phase Objective

Fix 4 audit findings: compile.ts barrel bypass (CRITICAL), dag-serializer require() violations (HIGH), composite-grader customFns bug (HIGH), and adapter deep \_\_schemas/ imports (HIGH x3).

## Decisions

### 1. compile.ts barrel bypass (#1)

Change imports in `src/compilers/__helpers/compile.ts` from direct file paths to sub-barrel:

- `~/adapters/claude/agent-emitter` → `~/adapters/claude`
- `~/adapters/claude/skill-emitter` → `~/adapters/claude`
- `~/adapters/claude/claude-adapter` → `~/adapters/claude`

The `~/adapters/claude/index.ts` sub-barrel already re-exports all needed symbols.

### 2. dag-serializer.ts require() violations (#2)

- Replace 3 inline `require('node:fs')` with a single top-level `import` statement
- Remove dead `Bun.file()` code (line ~102) that creates an unused file handle
- Use `import { existsSync, mkdirSync, unlinkSync, readFileSync } from 'node:fs'`

### 3. composite-grader customFns bug (#4)

The `customFns?.values().next().value` always picks the first function regardless of case ID. Fix:

- Add `caseId: string` parameter to `gradeWithComposite`
- Use `customFns?.get(caseId)` instead of `.values().next().value`
- Update `eval-runner.ts` to pass `evalCase.id` as the caseId parameter

### 4. Adapter deep \_\_schemas/ imports (#5-7)

Three adapter files bypass entity barrels. Fix by:

- Exporting `BaseAgent` from `src/agents/index.ts`
- Exporting `BaseSkill` from `src/skills/index.ts`
- Exporting `BaseRule` from `src/rules/index.ts`
- Updating adapter imports to use `~/agents`, `~/skills`, `~/rules` barrels
- `WorkflowStep` already exported from `~/workflow` barrel — use that

Files affected: `adapter.schemas.ts`, `claude-adapter.ts`, `api-adapter.ts`

## Scope Boundaries

In scope: Only the 4 findings listed above.
Out of scope: All other audit findings (Phases 2-3).
