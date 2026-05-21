---
phase: 225
plan: 2
type: improvement
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 225 Plan 2: Refactor Consumers to Use Shared Factories

## Objective

Replace duplicated enforcement hook logic, context read/write helpers, and ABORT_TRANSITION definitions across 14 files with imports from the 3 shared modules created in Wave 1. This eliminates ~650 LOC of duplication while preserving identical runtime behavior.

## Context

Wave 1 outputs (new shared modules):
@src/hooks/**helpers/enforcement-hook-factory.ts
@src/skills/**schemas/context-helpers.ts
@src/skills/\_\_schemas/states/shared-transitions.ts

Enforcement hooks to refactor:
@src/hooks/scripts/pre-step-lu.ts
@src/hooks/scripts/pre-step-phase-execute.ts
@src/hooks/scripts/pre-step-verify.ts
@src/hooks/scripts/pre-step-milestone-complete.ts

Context schema files to refactor:
@src/skills/**schemas/lu-context.schemas.ts
@src/skills/**schemas/phase-execute-context.schemas.ts
@src/skills/**schemas/verify-context.schemas.ts
@src/skills/**schemas/milestone-complete-context.schemas.ts
@src/skills/\_\_schemas/pr-address-context.schemas.ts

State machine files to refactor:
@src/skills/**schemas/states/lu.states.ts
@src/skills/**schemas/states/phase-execute.states.ts
@src/skills/**schemas/states/verify.states.ts
@src/skills/**schemas/states/milestone-complete.states.ts
@src/skills/\_\_schemas/states/pr-address.states.ts

Constraint references:
@.planning/phases/225-dry-consolidation/01-CONTEXT.md
@.planning/phases/225-dry-consolidation/01-PREMORTEM.md

## Tasks

### 1. Refactor 4 enforcement hooks to use factory

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 1 already complete)

Replace the full body of all 4 pre-step enforcement hooks with a single call to `createSubSkillEnforcementHook(config)` from the Wave 1 factory.

Each hook file should become ~30 lines: imports, config declaration, factory call. The config for each hook:

**pre-step-lu.ts:**

```typescript
{
  hookName: "pre-step-lu",
  contextPath: "/tmp/lu-context.json",
  subSkills: new Set(["lu-route", "lu-configure", "lu-backlog", "lu-phase-loop"]),
  validStates: {
    "lu-route": new Set(["idle"]),
    "lu-configure": new Set(["routed"]),
    "lu-backlog": new Set(["configured"]),
    "lu-phase-loop": new Set(["scanned", "configured"]),
  },
  initialSkill: "lu-route",
}
```

**pre-step-phase-execute.ts:**

```typescript
{
  hookName: "pre-step-phase-execute",
  contextPath: "/tmp/phase-execute-context.json",
  subSkills: new Set(["phase-execute-waves", "phase-execute-verify", "phase-execute-review"]),
  validStates: {
    "phase-execute-waves": new Set(["setup"]),
    "phase-execute-verify": new Set(["executed"]),
    "phase-execute-review": new Set(["verified"]),
  },
  // NO initialSkill — fail-closed on missing context (PREMORTEM R1)
}
```

**pre-step-verify.ts:**

```typescript
{
  hookName: "pre-step-verify",
  contextPath: "/tmp/verify-context.json",
  subSkills: new Set(["verify-extract", "verify-test", "verify-diagnose", "verify-review"]),
  validStates: {
    "verify-extract": new Set(["idle"]),
    "verify-test": new Set(["extracted"]),
    "verify-diagnose": new Set(["tested"]),
    "verify-review": new Set(["tested"]),
  },
  initialSkill: "verify-extract",
}
```

**pre-step-milestone-complete.ts:**

```typescript
{
  hookName: "pre-step-milestone-complete",
  contextPath: "/tmp/milestone-complete-context.json",
  subSkills: new Set(["milestone-learn", "milestone-prune", "milestone-shadow-gate", "milestone-archive", "milestone-finalize"]),
  validStates: {
    "milestone-learn": new Set(["idle"]),
    "milestone-prune": new Set(["learned"]),
    "milestone-shadow-gate": new Set(["pruned"]),
    "milestone-archive": new Set(["scanned"]),
    "milestone-finalize": new Set(["archived"]),
  },
  initialSkill: "milestone-learn",
}
```

Preserve the module-level JSDoc comment on each file (the `@module` and `@see` references). The JSDoc documents the behavioral contract and Layer 3 architecture. Only the implementation body changes.

**Files to edit:**

- `src/hooks/scripts/pre-step-lu.ts`
- `src/hooks/scripts/pre-step-phase-execute.ts`
- `src/hooks/scripts/pre-step-verify.ts`
- `src/hooks/scripts/pre-step-milestone-complete.ts`

**Verification:**

- Each file is ~25-35 lines (was ~145 each)
- Each file imports `createSubSkillEnforcementHook` from `../__helpers/enforcement-hook-factory.ts`
- Config values match the constants from the original files exactly
- pre-step-phase-execute has NO `initialSkill` (fail-closed)
- pre-step-lu has `initialSkill: "lu-route"` (fail-open for first skill)
- pre-step-verify has `initialSkill: "verify-extract"`
- pre-step-milestone-complete has `initialSkill: "milestone-learn"`
- `bunx --bun tsc --noEmit` passes

### 2. Refactor 5 context schema files to use context helpers factory

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 1 already complete)

Replace the duplicated `read*Context()` and `write*Context()` functions in all 5 context schema files with calls to `createContextHelpers()` from the Wave 1 factory.

For each file, replace the "Context File Helpers" section (~50-60 lines of read/write functions) with:

```typescript
const { read: readXxxContext, write: writeXxxContext } = createContextHelpers(
  XXX_CONTEXT_PATH,
  XxxContextSchema,
);
export { readXxxContext, writeXxxContext };
```

The mapping:

| File                                  | Path constant                   | Schema                         | read export                  | write export                  |
| ------------------------------------- | ------------------------------- | ------------------------------ | ---------------------------- | ----------------------------- |
| lu-context.schemas.ts                 | LU_CONTEXT_PATH                 | LuContextSchema                | readLuContext                | writeLuContext                |
| phase-execute-context.schemas.ts      | PHASE_EXECUTE_CONTEXT_PATH      | PhaseExecuteContextSchema      | readPhaseExecuteContext      | writePhaseExecuteContext      |
| verify-context.schemas.ts             | VERIFY_CONTEXT_PATH             | VerifyContextSchema            | readVerifyContext            | writeVerifyContext            |
| milestone-complete-context.schemas.ts | MILESTONE_COMPLETE_CONTEXT_PATH | MilestoneCompleteContextSchema | readMilestoneCompleteContext | writeMilestoneCompleteContext |
| pr-address-context.schemas.ts         | PR_ADDRESS_CONTEXT_PATH         | PrAddressContextSchema         | readPrContext                | writePrContext                |

Preserve all sub-skill output schemas, the top-level context schema, the path constant, and all type exports. Only the read/write function implementations are replaced.

**PREMORTEM R2:** When refactoring lu-context.schemas.ts, remove the `& Record<string, unknown>` escape hatch from the old `writeLuContext` signature. The factory's write signature is already `Partial<Omit<z.infer<TSchema>, "context_version">>` without the escape hatch. After this change, verify all call sites of `writeLuContext` still compile by running `bunx --bun tsc --noEmit`.

Add `import { createContextHelpers } from "./context-helpers"` at the top. Remove the `import merge from "lodash/merge"` import since the factory handles merging internally.

**Files to edit:**

- `src/skills/__schemas/lu-context.schemas.ts`
- `src/skills/__schemas/phase-execute-context.schemas.ts`
- `src/skills/__schemas/verify-context.schemas.ts`
- `src/skills/__schemas/milestone-complete-context.schemas.ts`
- `src/skills/__schemas/pr-address-context.schemas.ts`

**Verification:**

- Each file no longer imports `merge` from `lodash/merge`
- Each file imports `createContextHelpers` from `./context-helpers`
- Each file exports the same `read*` and `write*` function names as before
- The `& Record<string, unknown>` is removed from lu-context.schemas.ts
- Each file's sub-skill output schemas and type exports are untouched
- `bunx --bun tsc --noEmit` passes (confirms all call sites still compile)

### 3. Refactor 5 state machine files to import shared ABORT_TRANSITION

**Type:** auto
**TDD:** false
**Depends on:** none (Wave 1 already complete)

Replace the locally-defined `ABORT_TRANSITION` constant in all 5 state machine files with an import from `./shared-transitions.ts`.

In each file:

1. Add `import { ABORT_TRANSITION } from "./shared-transitions";` (or `./shared-transitions.ts`)
2. Remove the local `const ABORT_TRANSITION = { ABORT: "failed" } as const;` declaration
3. Remove the JSDoc block above the local declaration

**PREMORTEM R3:** All 5 files must be updated. Do not miss `pr-address.states.ts`.

The 5 files:

- `src/skills/__schemas/states/lu.states.ts`
- `src/skills/__schemas/states/phase-execute.states.ts`
- `src/skills/__schemas/states/verify.states.ts`
- `src/skills/__schemas/states/milestone-complete.states.ts`
- `src/skills/__schemas/states/pr-address.states.ts`

**Files to edit:**

- `src/skills/__schemas/states/lu.states.ts`
- `src/skills/__schemas/states/phase-execute.states.ts`
- `src/skills/__schemas/states/verify.states.ts`
- `src/skills/__schemas/states/milestone-complete.states.ts`
- `src/skills/__schemas/states/pr-address.states.ts`

**Verification:**

- All 5 files import `ABORT_TRANSITION` from `./shared-transitions`
- No file defines its own `const ABORT_TRANSITION`
- The `...ABORT_TRANSITION` spread in each state's `on` block still works
- `bunx --bun tsc --noEmit` passes

## Verification

After all 3 tasks complete, run `bunx --bun tsc --noEmit` as the comprehensive check. The type checker validates:

- All import paths resolve correctly
- All exported function signatures match their call sites
- The removed `& Record<string, unknown>` escape hatch doesn't break any callers
- The `ABORT_TRANSITION` import works in spread position

## Success Criteria

- 4 enforcement hooks reduced from ~145 lines each to ~30 lines each (~460 LOC saved)
- 5 context schema files each lose ~50-60 lines of duplicated read/write logic (~270 LOC saved)
- 5 state machine files each lose ~8 lines of duplicated ABORT_TRANSITION (~40 LOC saved)
- Total: ~770 LOC of duplication eliminated (exceeds initial ~650 estimate due to pr-address inclusion)
- All existing exports preserved (no breaking changes to consumers)
- Type check passes cleanly

## Output Specification

14 refactored TypeScript files with identical runtime behavior but consolidated implementation via the 3 shared factories from Wave 1.
