# Phase 222: Anti-Skip Infrastructure - Research

**Researched:** 2026-03-28
**Domain:** Workflow enforcement infrastructure (state machines, hooks, gap detection)
**Confidence:** HIGH

## Summary

This research investigates the existing codebase patterns that the Anti-Skip Infrastructure must integrate with. The phase adds four layers: per-skill state machines (Layer 2), progressive disclosure executor mode (Layer 1), pre-step hook enforcement (Layer 3), and event-sourced gap detection (Layer 4).

All four layers build on well-established patterns already in the codebase. The XState v5 `setup()` API is used in `packages/luca-framework/src/state/machine.ts`. The hook system uses `guardDedup`/`checkThrottle` in `src/hooks/__helpers/hook-io.ts`. The DAG executor in `src/workflow/__helpers/dag-executor.ts` provides the execution model. The bridge CLI at `packages/luca-framework/src/state/bridge.ts` follows a consistent subcommand dispatch pattern.

**Primary recommendation:** Follow existing factory patterns exactly. The `buildPhaseDAG` factory in dag-builder.ts and the `workflowMachine` in machine.ts are the two architectural templates to mirror.

## Standard Stack

### Core

| Library | Version | Purpose                                       | Why Standard                               |
| ------- | ------- | --------------------------------------------- | ------------------------------------------ |
| XState  | ^5.28.0 | State machine definition and execution        | Already used for the workflow machine      |
| Zod     | ^4.3.6  | Schema validation for state, events, context  | Project-wide standard, all schemas use Zod |
| Bun     | Runtime | TypeScript execution, file I/O, process spawn | Project runtime standard                   |

### Supporting

| Library          | Version | Purpose                     | When to Use                        |
| ---------------- | ------- | --------------------------- | ---------------------------------- |
| lodash/get       | \*      | Safe nested property access | Bridge reads, context field access |
| lodash/cloneDeep | \*      | Immutable state updates     | State machine context mutations    |

### No New Dependencies Required

All four layers can be implemented using existing dependencies. XState `setup()` is already available. No additional packages needed.

## Architecture Patterns

### Pattern 1: Functional Factory (dag-builder.ts template)

**What:** Closure-based builder that accumulates configuration and validates with `safeParse()` on `.build()`.
**When to use:** `createSkillStateMachine` factory
**File:** `src/workflow/__helpers/dag-builder.ts`

```typescript
// Source: dag-builder.ts lines 166-230
export function buildPhaseDAG(name: string): DAGBuilder {
  const steps: z.input<typeof WorkflowStepSchema>[] = [];
  // ... accumulate via chained .step() calls
  const builder: DAGBuilder = {
    step(id, config) {
      steps.push(/* ... */);
      return builder;
    },
    build(): Readonly<WorkflowDAG> {
      const parseResult = WorkflowDAGSchema.safeParse(raw);
      if (!parseResult.success) throw new Error(/* ... */);
      return deepFreeze(parseResult.data);
    },
  };
  return builder;
}
```

**Key constraint:** No classes (per no-classes rule). Use closure-based factory returning an object literal.

### Pattern 2: XState setup() with Typed Context (machine.ts template)

**What:** XState v5 `setup()` API with typed context, events, guards, and actions.
**When to use:** Per-skill state machine definitions
**File:** `packages/luca-framework/src/state/machine.ts`

```typescript
// Source: machine.ts lines 75-357
export const workflowMachine = setup({
  types: {
    context: {} as WorkflowContext,
    events: {} as WorkflowEvent,
    input: {} as WorkflowMachineInput | undefined,
  },
  guards: workflowGuards,
  actions: {
    recordTransition: assign({
      last_transition_at: () => new Date().toISOString(),
    }),
    // ... more actions with assign()
  },
}).createMachine({
  id: "luca-workflow",
  initial: "idle",
  context: ({ input }) => initializeContext(input ?? undefined),
  states: {
    /* ... */
  },
});
```

**Key observations:**

- Guards are defined separately in `guards.ts` and referenced by name
- Actions use `assign()` for immutable context updates
- Events are typed as a discriminated union in `types.ts`
- The machine is created as a module-level constant (not inside a function)

### Pattern 3: Hook Dedup Guard (hook-io.ts template)

**What:** `/tmp` timestamp-file guard that prevents double-firing within a TTL window.
**When to use:** Pre-step enforcement hook to prevent re-entrancy
**File:** `src/hooks/__helpers/hook-io.ts`

```typescript
// Source: hook-io.ts lines 159-179
export const guardDedup = (hookName: string, ttlSeconds = 5): void => {
  const projectHash = createHash("sha256")
    .update(projectDir())
    .digest("hex")
    .slice(0, 8);
  const guardFile = `/tmp/.luca-dedup-${hookName}-${projectHash}`;
  try {
    const content = readFileSync(guardFile, "utf-8").trim();
    const lastRun = parseInt(content, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - lastRun < ttlSeconds) {
      process.exit(0);
    }
  } catch {
    /* File doesn't exist */
  }
  const now = Math.floor(Date.now() / 1000);
  writeFileSync(guardFile, String(now));
};
```

**Extension for pre-step:** The PREMORTEM constraint specifies 200ms TTL. The existing `guardDedup` uses integer seconds (`Math.floor(Date.now() / 1000)`). For 200ms TTL, switch to millisecond precision (`Date.now()` directly) and compare `now - lastRun < 200`.

**Also relevant:** `checkThrottle` (lines 200-209) and `recordThrottle` (lines 219-225) provide a read/write separated pattern for more flexible throttle checks.

### Pattern 4: Bridge CLI Subcommand (bridge.ts template)

**What:** CLI dispatch pattern with `VALID_SUBCOMMANDS` array, `handleXxx` async functions, and JSON stdout.
**When to use:** Adding `audit-gaps` subcommand to the bridge
**File:** `packages/luca-framework/src/state/bridge.ts`

```typescript
// Source: bridge.ts lines 193-209
const VALID_SUBCOMMANDS = [
  "read-status",
  "read-complexity" /* ... */,
  "emit-event",
  "init-vault",
] as const;

// Source: bridge.ts lines 1414-1465
switch (subcommand) {
  case "read-complexity":
    await handleReadComplexity();
    break;
  // ... one case per subcommand
  default:
    console.error(`Unknown subcommand: "${subcommand}"`);
    process.exit(2);
}
```

**Pattern for `audit-gaps`:**

1. Add `"audit-gaps"` to `VALID_SUBCOMMANDS` array
2. Create `handleAuditGaps(args: string[])` async function
3. Add `case "audit-gaps":` to the switch
4. Export `handleAuditGaps` at bottom
5. Output JSON array of gap descriptions to stdout

### Pattern 5: Hook Registry Entry (hook-registry.ts template)

**What:** Each hook is a thunk returning a `CanonicalHook` object in `canonicalHookRegistry`.
**When to use:** Registering the pre-step enforcement hook
**File:** `src/hooks/__helpers/hook-registry.ts`

```typescript
// Source: hook-registry.ts lines 44-53
"pre-commit-gate": () => ({
  event: "pre_tool_use",
  tool_filter: "Bash",
  command_filter: "git commit|git merge|bun run commit|bunx commit|bunx --bun commit",
  script: "pre-commit-gate.ts",
  timeout: 120,
  async: false,
  status_message: "Running pre-commit checks...",
}),
```

**For pre-step hook:** Will need `event: "pre_tool_use"` with `tool_filter: "Bash"` and a `command_filter` that matches Skill() invocations or specific step-related commands.

### Anti-Patterns to Avoid

- **Class-based state machines:** Use XState `setup()` + `createMachine()` as functional API, not custom classes
- **Inline `import()` in types:** All imports at file top
- **Destructuring defaults:** All defaults in Zod schemas, never in destructuring

## Don't Hand-Roll

| Problem       | Don't Build           | Use Instead                                    | Why                                                 |
| ------------- | --------------------- | ---------------------------------------------- | --------------------------------------------------- |
| State machine | Custom state tracker  | XState v5 `setup()`                            | Battle-tested, typed transitions, guards, actions   |
| Hook dedup    | Custom lock mechanism | `guardDedup` / `checkThrottle` from hook-io.ts | Already handles crash recovery, per-project scoping |
| DAG execution | Custom step runner    | `executeDAG` from dag-executor.ts              | Handles retry, timeout, checkpoint, parallel waves  |
| CLI dispatch  | Custom arg parsing    | `getArg`/`hasFlag` from cli-utils.ts           | Consistent with existing bridge patterns            |
| Deep freeze   | Manual Object.freeze  | `deepFreeze` from shared                       | Recursive, handles nested objects                   |

## Common Pitfalls

### Pitfall 1: DAGCheckpoint.skippedSteps Is Bare Strings

**What goes wrong:** The gap detector needs to distinguish "guard returned false" from "guard threw exception" from "explicit --skip flag". The current `skippedSteps` field is `z.array(z.string())` -- just step IDs with no reason metadata.

**Why it happens:** The original design didn't anticipate needing skip reasons.

**How to avoid:** Widen `skippedSteps` from `z.array(z.string())` to structured objects BEFORE implementing the gap detector. The PREMORTEM specifies this as Constraint #1.

**Critical code locations:**

- Schema: `src/workflow/__schemas/workflow.schemas.ts` line 355: `skippedSteps: z.array(z.string())`
- Writer: `src/workflow/__helpers/dag-executor.ts` line 277: `skippedSteps: Object.entries(stepResults).filter(...).map(([id]) => id)`
- Reader: `src/workflow/__helpers/dag-executor.ts` line 155: `for (const stepId of checkpoint.skippedSteps)`

### Pitfall 2: Guard Exception Swallowing (dag-executor.ts lines 196-204)

**What goes wrong:** Both `guardResult === false` and `catch {}` produce identical `status: "skipped"` entries. No way to distinguish after the fact.

**Why it happens:** Lines 184-205 of dag-executor.ts treat guard exceptions identically to guard-false.

**How to avoid:** When updating the skipped step recording, include a `reason` discriminant:

- `guard-false`: Guard returned false normally
- `guard-exception`: Guard threw an exception (should be investigated)
- `flag-skip`: Step skipped via explicit `--skip-*` flag

### Pitfall 3: Pre-Step Hook TTL Too Wide for Parallel Waves

**What goes wrong:** If TTL is 1-2 seconds (like existing guardDedup's 5s default), parallel wave execution with `Promise.allSettled` may collapse distinct skill invocations.

**Why it happens:** Claude Code hooks fire per Bash tool invocation. Parallel waves fire multiple Bash calls in rapid succession.

**How to avoid:** Use 200ms TTL (per PREMORTEM Constraint #2). Include `toolName` in the guard key to scope narrowly: `/tmp/.luca-prestep-{hookName}-{projectHash}-{toolName}-ts`.

### Pitfall 4: WorkflowStepSchema Missing `optional` Field

**What goes wrong:** The gap detector needs to classify steps as required vs optional. The current `WorkflowStepSchema` has no `optional` field.

**Why it happens:** Original design assumed all steps are required; optionality is a new concept.

**How to avoid:** Add `optional: z.boolean().default(false)` to `WorkflowStepSchema` in `src/workflow/__schemas/workflow.schemas.ts`. This is backward-compatible since it defaults to `false`.

## Code Examples

### Adding `optional` to WorkflowStepSchema

```typescript
// File: src/workflow/__schemas/workflow.schemas.ts
// Add after line 157 (metadata field), before the closing });
export const WorkflowStepSchema = z.object({
  // ... existing fields ...
  metadata: StepMetadataSchema.optional(),
  /** Whether this step is optional (gap detector treats missing as WARNING not FAIL). */
  optional: z.boolean().default(false),
});
```

### Widening DAGCheckpointSchema.skippedSteps

```typescript
// File: src/workflow/__schemas/workflow.schemas.ts
// New schema for structured skip entries
export const SkipReasonSchema = z.enum([
  "guard-false",
  "guard-exception",
  "flag-skip",
]);
export type SkipReason = z.infer<typeof SkipReasonSchema>;

export const SkippedStepEntrySchema = z.object({
  id: z.string(),
  reason: SkipReasonSchema,
  optional: z.boolean().default(false),
});
export type SkippedStepEntry = z.infer<typeof SkippedStepEntrySchema>;

// Update DAGCheckpointSchema
export const DAGCheckpointSchema = z.object({
  // ... existing fields ...
  /** Steps that were skipped, with structured reason metadata. */
  skippedSteps: z.array(SkippedStepEntrySchema),
  // ... remaining fields ...
});
```

### Creating the Skill State Machine Factory

```typescript
// File: src/workflow/__helpers/skill-state-machine.ts
import { setup, assign, createActor } from "xstate";
import type { z } from "zod";

/**
 * Factory to create a per-skill state machine with Zod-validated context.
 *
 * Wraps XState setup() with caller-supplied schemas for states, events,
 * and guards. Returns an object with the machine definition and a
 * createActor() convenience function.
 */
export function createSkillStateMachine<
  TContext extends Record<string, unknown>,
  TEvent extends { type: string },
>(config: {
  id: string;
  contextSchema: z.ZodType<TContext>;
  states: Record<string, { on?: Record<string, unknown> }>;
  initialContext: TContext;
  guards?: Record<string, (ctx: TContext) => boolean>;
  actions?: Record<string, unknown>;
}) {
  const machine = setup({
    types: {
      context: {} as TContext,
      events: {} as TEvent,
    },
    guards: config.guards ?? {},
    actions: config.actions ?? {},
  }).createMachine({
    id: config.id,
    initial: Object.keys(config.states)[0],
    context: () => config.initialContext,
    states: config.states,
  });

  return {
    machine,
    spawn: (input?: Partial<TContext>) => createActor(machine, { input }),
  };
}
```

### Pre-Step Hook Guard with 200ms TTL

```typescript
// Extension of guardDedup for millisecond precision
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { projectDir } from "./hook-io.ts";

/**
 * Millisecond-precision dedup guard for pre-step hooks.
 *
 * Unlike guardDedup (second precision), this uses Date.now()
 * directly for sub-second TTL windows.
 *
 * TTL: 200ms (per PREMORTEM Constraint #2)
 */
export const guardPreStep = (
  hookName: string,
  toolName: string,
  ttlMs = 200,
): void => {
  const hash = createHash("sha256")
    .update(projectDir())
    .digest("hex")
    .slice(0, 8);
  const guardFile = `/tmp/.luca-prestep-${hookName}-${hash}-${toolName}-ts`;
  try {
    const lastRun = parseInt(readFileSync(guardFile, "utf-8").trim(), 10);
    const now = Date.now();
    if (now - lastRun < ttlMs) {
      process.exit(0);
    }
  } catch {
    /* File doesn't exist */
  }
  writeFileSync(guardFile, String(Date.now()));
};
```

### Bridge `audit-gaps` Subcommand Pattern

```typescript
// File: packages/luca-framework/src/state/bridge.ts (additions)
// Add to VALID_SUBCOMMANDS: "audit-gaps"
// Add handler:

async function handleAuditGaps(args: string[]): Promise<void> {
  // Read the DAG execution context from state
  const result = await readFromState({
    fromSnapshot: (ctx) => ctx.dag_execution ?? null,
    defaults: null,
  });

  if (!result) {
    console.log(JSON.stringify({ gaps: [], status: "no_execution_data" }));
    return;
  }

  // Gap detection logic here
  // Output: JSON array of { step_id, expected_status, recommendation }
  console.log(JSON.stringify({ gaps: [], status: "clean" }));
}
```

## Existing File Integration Map

### Files to Modify

| File                                          | Modification                                                                       | Layer  |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ------ |
| `src/workflow/__schemas/workflow.schemas.ts`  | Add `optional` to WorkflowStepSchema, widen `skippedSteps`, add `SkipReasonSchema` | L2, L4 |
| `src/workflow/__helpers/dag-executor.ts`      | Record structured skip entries (reason field)                                      | L4     |
| `src/workflow/index.ts`                       | Export new schemas and `createSkillStateMachine`                                   | L2     |
| `src/hooks/__helpers/hook-registry.ts`        | Register pre-step enforcement hook                                                 | L3     |
| `src/hooks/__helpers/hook-io.ts`              | Add `guardPreStep` function (ms-precision)                                         | L3     |
| `packages/luca-framework/src/state/bridge.ts` | Add `audit-gaps` subcommand                                                        | L4     |

### Files to Create

| File                                             | Purpose                                               | Layer |
| ------------------------------------------------ | ----------------------------------------------------- | ----- |
| `src/workflow/__helpers/skill-state-machine.ts`  | Factory for per-skill state machines                  | L2    |
| `src/workflow/__helpers/progressive-executor.ts` | `executeProgressively()` with zone-adaptive summaries | L1    |
| `src/hooks/scripts/pre-step-enforcement.ts`      | Hook script for pre-step validation                   | L3    |
| `src/workflow/__helpers/gap-detector.ts`         | Post-execution gap audit logic                        | L4    |

### Files to Reference (Read-Only)

| File                                            | What to Reference                                  |
| ----------------------------------------------- | -------------------------------------------------- |
| `src/context/__helpers/resolve-context-tier.ts` | Context zone resolution for progressive disclosure |
| `src/context/__schemas/context.schemas.ts`      | `CONTEXT_TIERS`, `ContextTier` type                |
| `packages/luca-framework/src/state/machine.ts`  | XState `setup()` pattern to follow                 |
| `packages/luca-framework/src/state/types.ts`    | `WorkflowContext`, `WorkflowEvent` types           |
| `src/workflow/__helpers/dag-builder.ts`         | Functional factory pattern template                |
| `src/hooks/scripts/pre-commit-gate.ts`          | PreToolUse hook implementation pattern             |
| `src/hooks/__helpers/bridge.ts`                 | `runBridge()` for hook-to-bridge communication     |

## State of the Art

| Old Approach             | Current Approach                             | When Changed | Impact                                       |
| ------------------------ | -------------------------------------------- | ------------ | -------------------------------------------- |
| String-only skippedSteps | Structured skip entries (this phase)         | v8.5.0       | Gap detector can distinguish skip reasons    |
| No optional step concept | `optional: boolean` on WorkflowStep          | v8.5.0       | Gap detector has three-tier tolerance        |
| No pre-step enforcement  | Pre-step hook with TTL guard                 | v8.5.0       | Framework-level enforcement of step ordering |
| Full context inclusion   | Progressive disclosure with zone degradation | v8.5.0       | Better context budget management             |

## Open Questions

1. **Context zone signal source for progressive disclosure**
   - What we know: `resolveContextTierFromMatrix()` in `src/context/__helpers/resolve-context-tier.ts` resolves context tiers based on complexity. Context zones (PEAK/GOOD/DEGRADING/POOR) are described in the workflow system but the exact runtime signal source for "current context usage percentage" is not clear from the codebase.
   - What's unclear: Whether the zone signal comes from the bridge's `appetite_used_tokens` / `appetite_context_percent` fields (available via `read-status`), or from Claude Code's own context tracking.
   - Recommendation: Use `appetite_context_percent` from the bridge `read-status` as the zone signal. Map: 0-30% = PEAK, 30-50% = GOOD, 50-70% = DEGRADING, 70%+ = POOR. Re-query at each wave boundary per PREMORTEM Constraint #3.

2. **Pre-step hook tool_filter scope**
   - What we know: Existing `pre-commit-gate` filters on `tool_filter: "Bash"` with `command_filter` matching git commit commands.
   - What's unclear: What tool name/command pattern uniquely identifies Skill() invocations in the hook stdin. The Skill tool appears as a separate tool type in Claude Code, not as a Bash command.
   - Recommendation: The pre-step hook should filter on both `tool_filter: "Bash"` (for bridge commands) and potentially `tool_filter: "Skill"` (for direct Skill invocations). Investigate hook stdin shape for Skill tool calls during implementation.

## Sources

### Primary (HIGH confidence)

- `src/workflow/__schemas/workflow.schemas.ts` -- WorkflowStepSchema, DAGCheckpointSchema definitions
- `src/workflow/__helpers/dag-executor.ts` -- Guard handling, skip recording (lines 184-205, 275-278)
- `src/workflow/__helpers/dag-builder.ts` -- Functional factory pattern
- `packages/luca-framework/src/state/machine.ts` -- XState setup() pattern
- `packages/luca-framework/src/state/bridge.ts` -- Bridge CLI subcommand pattern
- `src/hooks/__helpers/hook-io.ts` -- guardDedup, checkThrottle patterns
- `src/hooks/__helpers/hook-registry.ts` -- Hook registration pattern
- `src/hooks/scripts/pre-commit-gate.ts` -- PreToolUse hook implementation
- `packages/luca-framework/package.json` -- XState ^5.28.0, Zod ^4.3.6

### Secondary (MEDIUM confidence)

- `src/context/__helpers/resolve-context-tier.ts` -- Context tier resolution pattern (zone signal unclear)
- `.planning/phases/222-anti-skip-infrastructure/01-CONTEXT.md` -- Locked design decisions
- `.planning/phases/222-anti-skip-infrastructure/01-PREMORTEM.md` -- Constraints and failure scenarios

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- all libraries already in use, versions confirmed from package.json
- Architecture: HIGH -- all patterns verified directly from source code
- Pitfalls: HIGH -- specific line numbers and code paths identified
- Integration points: HIGH -- exact file paths and function signatures documented
- Context zone signal: MEDIUM -- appetite fields exist in bridge but zone mapping needs validation

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain, internal codebase patterns)
