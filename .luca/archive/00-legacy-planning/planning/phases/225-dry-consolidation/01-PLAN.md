---
phase: 225
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 225 Plan 1: Extract Shared Factories and Constants

## Objective

Create three new shared modules that eliminate ~650 LOC of duplication across the anti-skip enforcement layer: an enforcement hook factory, a context helpers factory, and a shared ABORT_TRANSITION constant. These are dependency-free foundations consumed by Wave 2.

## Context

@src/hooks/scripts/pre-step-lu.ts
@src/hooks/scripts/pre-step-phase-execute.ts
@src/hooks/scripts/pre-step-verify.ts
@src/hooks/scripts/pre-step-milestone-complete.ts
@src/hooks/**helpers/hook-io.ts
@src/skills/**schemas/lu-context.schemas.ts
@src/skills/**schemas/phase-execute-context.schemas.ts
@src/skills/**schemas/verify-context.schemas.ts
@src/skills/**schemas/milestone-complete-context.schemas.ts
@src/skills/**schemas/states/lu.states.ts
@src/skills/**schemas/states/phase-execute.states.ts
@src/skills/**schemas/states/verify.states.ts
@src/skills/**schemas/states/milestone-complete.states.ts
@src/skills/**schemas/states/pr-address.states.ts
@.planning/phases/225-dry-consolidation/01-CONTEXT.md
@.planning/phases/225-dry-consolidation/01-PREMORTEM.md

## Tasks

### 1. Create shared ABORT_TRANSITION constant

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/states/shared-transitions.ts` exporting the ABORT_TRANSITION constant that all 5 state machine files currently define identically.

The constant is: `const ABORT_TRANSITION = { ABORT: "failed" } as const;`

Export it as a named export. Include JSDoc documenting that this is consumed by all orchestrator state machines and that it maps the ABORT event to the "failed" terminal state.

**Files to create:**

- `src/skills/__schemas/states/shared-transitions.ts`

**Verification:**

- File exports `ABORT_TRANSITION` with value `{ ABORT: "failed" } as const`
- JSDoc describes purpose and consumers
- `bunx --bun tsc --noEmit` passes

### 2. Create enforcement hook factory

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/hooks/__helpers/enforcement-hook-factory.ts` with a `createSubSkillEnforcementHook(config)` factory function.

**Config interface (Zod schema):**

```typescript
interface EnforcementHookConfig {
  hookName: string; // e.g., "pre-step-lu"
  contextPath: string; // e.g., "/tmp/lu-context.json"
  subSkills: ReadonlySet<string>; // Skill names this hook enforces
  validStates: Record<string, ReadonlySet<string>>; // Skill -> set of valid pre-states
  initialSkill?: string; // Skill valid from missing context file
}
```

The factory returns an async function that:

1. Reads stdin via `readStdinJson()` from hook-io.ts
2. Exits success if `tool_name !== "Skill"`
3. Calls `guardPreStep(hookName, toolName)` for 200ms TTL dedup
4. Extracts skill name from `tool_input.skill` or `tool_input.args`
5. Matches against `subSkills` set
6. If no match, exits success (not our sub-skill)
7. Reads context file at `contextPath` via `readFileSync`
8. On file-not-found:
   - If `initialSkill` is set AND matched skill === `initialSkill`, exits success (fail-open)
   - Otherwise, exits block with descriptive message (fail-closed)
9. Validates `current_state` against `validStates[matchedSkill]`
10. Exits success if valid, exits block if invalid

**PREMORTEM R1:** Document `initialSkill` as a fail-open exception in JSDoc. When `initialSkill` is undefined, the hook is unconditionally fail-closed on missing context. This must be an explicit JSDoc warning.

The factory must import from `../hook-io.ts` (not `../hook-io`) to match the existing import style in the hooks directory.

**Files to create:**

- `src/hooks/__helpers/enforcement-hook-factory.ts`

**Verification:**

- Factory function is exported and accepts the config interface
- JSDoc on `initialSkill` explicitly warns about fail-open behavior
- Logic matches the 4 existing hooks exactly (diff the control flow)
- `bunx --bun tsc --noEmit` passes

### 3. Create context helpers factory

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/skills/__schemas/context-helpers.ts` with a generic `createContextHelpers<TSchema extends z.ZodType>(path, schema)` factory.

The factory returns `{ read, write }` where:

**`read()` implementation:**

1. Uses `Bun.file(path)` to check if file exists
2. If not exists, returns `schema.safeParse({})` (will fail on missing `context_version`)
3. If exists, reads JSON via `file.json()` and returns `schema.safeParse(raw)`
4. On any error (JSON parse, file read), returns `schema.safeParse({})` as fallback
5. Return type: `Promise<{ success: true; data: z.infer<TSchema> } | { success: false; error: z.ZodError }>`

**`write(patch)` implementation:**

1. Reads current file (if exists) into `Record<string, unknown>`, defaults to `{ context_version: 1 }`
2. On read error, starts fresh with `{ context_version: 1 }`
3. Forces `current.context_version = 1`
4. Deep merges patch via `lodash/merge`
5. Writes back via `Bun.write(path, JSON.stringify(merged, null, 2))`

**PREMORTEM R2:** The `write` patch parameter type MUST be `Partial<Omit<z.infer<TSchema>, "context_version">>`. Do NOT include `& Record<string, unknown>` escape hatch. This preserves type safety so TypeScript catches typos in patch field names.

Note: `lu-context.schemas.ts` currently has `& Record<string, unknown>` on its `writeLuContext` signature. This will be removed when consumers migrate in Wave 2.

**Files to create:**

- `src/skills/__schemas/context-helpers.ts`

**Verification:**

- Factory is generic over `TSchema extends z.ZodType`
- `read()` return type matches the existing pattern in all 5 context schema files
- `write(patch)` accepts only `Partial<Omit<z.infer<TSchema>, "context_version">>` (no escape hatch)
- Imports: `z` from zod, `merge` from lodash/merge, uses `Bun.file` and `Bun.write`
- JSDoc with usage examples
- `bunx --bun tsc --noEmit` passes

## Verification

Run `bunx --bun tsc --noEmit` after all 3 tasks complete. All 3 new files must compile without errors. No existing files are modified in this wave, so no regression risk.

## Success Criteria

- `src/skills/__schemas/states/shared-transitions.ts` exists and exports `ABORT_TRANSITION`
- `src/hooks/__helpers/enforcement-hook-factory.ts` exists and exports `createSubSkillEnforcementHook`
- `src/skills/__schemas/context-helpers.ts` exists and exports `createContextHelpers`
- Type check passes: `bunx --bun tsc --noEmit`
- No existing files modified

## Output Specification

Three new TypeScript source files ready for consumption by Wave 2 refactoring tasks.
