---
phase: 6
plan: 4
type: feature
autonomous: true
wave: 4
depends_on: [3]
---

# Phase 6 Plan 4: Final Wiring (DAG-Adapter Bridge + Domain Barrel + Registration)

## Objective

Complete the adapter domain by creating the DAG-adapter bridge (B09), the domain barrel (B10), the side-effect registration module, and updating documentation. This wave narrows the `executeStep` type from `unknown` to `WorkflowStep`, creates the T3-to-T1 bridge function, wires up the domain barrel with pure re-exports, and pre-registers built-in adapters.

> PREMORTEM constraint: B09 must use aliased type imports to prevent `Adapter` name collision between T1 (workflow) and T3 (adapters).

## Context

- @.planning/todos/pending/runtime-b09-dag-adapter-integration.md (exact implementation spec for B09)
- @.planning/todos/pending/runtime-b10-domain-barrel-registration.md (exact implementation spec for B10)
- @.planning/phases/06-adapter-architecture/06-CONTEXT.md (T1/T3 coexistence, boundary script already updated)
- @.planning/phases/06-adapter-architecture/06-RESEARCH.md (T1 Adapter type shape at workflow.schemas.ts lines 380-402)
- @.planning/phases/06-adapter-architecture/PREMORTEM.md (Adapter type collision risk, aliased imports)
- @src/workflow/\_\_schemas/workflow.schemas.ts (T1 Adapter type, WorkflowStep, StepResult)
- @src/workflow/\_\_helpers/dag-executor.ts (DAG executor consuming adapter.executeStep with 3 args)
- @src/adapters/\_\_schemas/adapter.schemas.ts (T3 Adapter type from W1/B01)
- @src/adapters/claude/claude-adapter.ts (createClaudeAdapter from W3/B05)
- @src/adapters/api/api-adapter.ts (createApiAdapter from W3/B07)
- @scripts/check-domain-boundaries.ts (adapters: 3 already exists at line 38)
- @docs/generation-system.md (directory tree to update)

## Tasks

### 1. Create adapter-executor bridge (B09 - bridge helper)

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/adapters/__helpers/adapter-executor-bridge.ts` that maps the full T3 `Adapter` to the minimal T1 `WorkflowAdapter` (named `Adapter` in `workflow.schemas.ts`) expected by the DAG executor.

The bridge function `bridgeAdapterForExecutor(adapter)`:

- Takes a full T3 `Adapter` and returns an object matching T1's `Adapter` shape: `{ name: string, executeStep: (step, input, context) => Promise<StepResult> }`
- Throws if `adapter.executeStep` is undefined (adapter doesn't support execution)
- Maps `AdapterStepResult` (T3) to `StepResult` (T1): maps success to "completed"/"failed" status, passes through output/error, sets durationMs=0 and retryCount=0 (timing is measured by DAG executor)
- Uses `step as Record<string, unknown>` to extract `stepId` since the bridge receives `unknown` from the T1 side

This function lives in T3 (`src/adapters/`) and imports from T1 (`~/workflow`) -- legal downward import. The DAG executor in T1 never imports from T3 -- callers use the bridge before passing to `executeDAG()`.

**Files to create:**

- `src/adapters/__helpers/adapter-executor-bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Exports `bridgeAdapterForExecutor`
- No T1-imports-T3 violations

### 2. Narrow executeStep types in adapter schemas (B09 - type narrowing)

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/adapters/__schemas/adapter.schemas.ts` to narrow the `executeStep` parameter from `unknown` to `WorkflowStep`:

- Add import: `import type { WorkflowStep } from "~/workflow/__schemas/workflow.schemas"`
- Change `executeStep?` parameter type from `step: unknown` to `step: WorkflowStep`

Then update the concrete adapter implementations:

In `src/adapters/claude/claude-adapter.ts`:

- Add import for `WorkflowStep`
- Change `_step: unknown` to `_step: WorkflowStep` in executeStep

In `src/adapters/api/api-adapter.ts`:

- Add import for `WorkflowStep`
- Change `step: unknown` to `step: WorkflowStep` in executeStep
- Replace `step as Record<string, unknown>` casts with typed property access where possible (use `step.name`, `step.handler`)
- Keep `(step as Record<string, unknown>).prompt` cast for non-standard prompt field

**Files to edit:**

- `src/adapters/__schemas/adapter.schemas.ts`
- `src/adapters/claude/claude-adapter.ts`
- `src/adapters/api/api-adapter.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `Adapter.executeStep` parameter is typed as `WorkflowStep`
- Both concrete adapters use `WorkflowStep` for executeStep parameter
- No type errors from the narrowing

### 3. Create domain barrel (B10 - barrel)

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Create `src/adapters/index.ts` as a pure barrel with ONLY re-export statements. No logic, no side effects, no registration calls.

Re-exports organized by section:

- **Schemas and Types**: All schemas and types from `__schemas/adapter.schemas`
- **Registry**: All 6 functions + `DETECTION_ORDER` from `__helpers/adapter-registry`
- **Adapter-Executor Bridge**: `bridgeAdapterForExecutor` from `__helpers/adapter-executor-bridge`
- **Claude Adapter**: `createClaudeAdapter`, `emitAgentMarkdown`, `emitSkillMarkdown`, `emitSkillPluginMarkdown` from `./claude`
- **API Adapter**: `createApiAdapter`, `ApiAdapterOptionsSchema`, `ApiExecutorConfigSchema`, `TokenUsageSchema`, `executeViaSDK` + types from `./api`

The barrel does NOT import `register-builtins.ts`. Side-effect registration is explicit.

**Files to create:**

- `src/adapters/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Barrel contains ONLY `export { ... } from` and `export type { ... } from` statements
- No import of `register-builtins.ts`
- No logic, no schemas, no constants defined in barrel

### 4. Create built-in adapter registration (B10 - registration)

**Type:** auto
**TDD:** false
**Depends on:** 3

Create `src/adapters/__helpers/register-builtins.ts` as a side-effect module that pre-registers the Claude and API adapters.

Contents:

- Import `registerAdapter` from `./adapter-registry`
- Import `createClaudeAdapter` from `../claude/claude-adapter`
- Import `createApiAdapter` from `../api/api-adapter`
- Call `registerAdapter(createClaudeAdapter())`
- Call `registerAdapter(createApiAdapter())`

Consumers import this module for its side effect: `import "~/adapters/__helpers/register-builtins"`. This is NOT re-exported from the barrel.

**Files to create:**

- `src/adapters/__helpers/register-builtins.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- File registers both "claude" and "api" adapters
- File is NOT imported by `src/adapters/index.ts`

### 5. Verify boundary script and update docs (B10 - docs)

**Type:** auto
**TDD:** false
**Depends on:** 3, 4

**Boundary script verification:**
`scripts/check-domain-boundaries.ts` already contains `adapters: 3` at line 38 (verified in CONTEXT.md decision 3). Confirm this by reading the file, then run the boundary check:

```bash
bun run scripts/check-domain-boundaries.ts
```

If `adapters: 3` is NOT present (contradicting CONTEXT.md), add it to the `DOMAIN_TIER` record.

**Documentation update:**
Update `docs/generation-system.md` to include the `src/adapters/` directory tree. Find the `src/` directory tree section and add the adapters domain structure showing all files created in this phase.

**Files to verify/edit:**

- `scripts/check-domain-boundaries.ts` (verify `adapters: 3` exists)
- `docs/generation-system.md` (add adapters directory tree)

**Verification:**

- `bun run scripts/check-domain-boundaries.ts` passes with zero violations
- `docs/generation-system.md` includes the `src/adapters/` directory tree
- No domain outside T3 imports from `adapters`

## Verification

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
```

- All new files exist in correct directory structure
- No TypeScript errors across the full project
- Domain boundary check passes with zero violations
- Barrel contains only re-export statements
- Side-effect registration is isolated in `register-builtins.ts`
- Documentation reflects the new domain structure
- No classes used
- All files use kebab-case naming

## Success Criteria

- `bridgeAdapterForExecutor` correctly maps T3 Adapter to T1 WorkflowAdapter shape
- `executeStep` is typed with `WorkflowStep` across all adapter schemas and implementations
- Domain barrel provides complete public API for the adapters module
- Built-in adapters (Claude + API) are pre-registerable via explicit side-effect import
- Domain boundary check confirms no tier violations
- Phase 6 adapter domain is complete and ready for Phase 7 (compiler refactoring)

## Output Specification

- `src/adapters/__helpers/adapter-executor-bridge.ts` (new file)
- `src/adapters/__schemas/adapter.schemas.ts` (modified -- executeStep narrowed)
- `src/adapters/claude/claude-adapter.ts` (modified -- WorkflowStep type)
- `src/adapters/api/api-adapter.ts` (modified -- WorkflowStep type)
- `src/adapters/index.ts` (new file -- domain barrel)
- `src/adapters/__helpers/register-builtins.ts` (new file -- side-effect registration)
- `scripts/check-domain-boundaries.ts` (verified, possibly no change)
- `docs/generation-system.md` (modified -- directory tree updated)
