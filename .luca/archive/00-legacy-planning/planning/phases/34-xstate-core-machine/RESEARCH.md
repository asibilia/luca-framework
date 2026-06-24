# Phase 34 Research: XState Core Machine

## Overview

Phase 34 introduces an XState v5 state machine to replace markdown-based state management in the Luca workflow. This research covers XState v5 APIs, current codebase patterns, recommended architecture, implementation approach per requirement, risks, and dependencies.

---

## 1. XState v5 Key Concepts

### 1.1 Actor Model

XState v5 is built on the actor model. Actors are independent, encapsulated entities that communicate via asynchronous message passing (events). Each actor has internal state that only it can update. Key APIs:

- **`createActor(logic, options?)`** -- creates a "live" instance of actor logic. The first actor created is the root of an implicit actor system.
- **`actor.start()`** / **`actor.stop()`** -- lifecycle management.
- **`actor.send({ type: 'EVENT' })`** -- sends events to the actor's mailbox.
- **`actor.getSnapshot()`** -- returns the current public state snapshot.
- **`actor.subscribe(callback)`** -- observes state changes.

Relevance: The Luca workflow orchestrator becomes a root actor. Phases, milestones, and sub-workflows become child actors.

### 1.2 `setup()` + `createMachine()`

XState v5 uses `setup()` to pre-register types, actions, guards, actors, and delays with full TypeScript inference:

```typescript
import { setup, assign } from "xstate";

const machine = setup({
  types: {
    context: {} as WorkflowContext,
    events: {} as WorkflowEvent,
  },
  guards: {
    isComplexEnough: ({ context }) =>
      meetsThreshold(context.complexity, "MODERATE"),
    gateEnabled: ({ context }, params) => context.gates[params.gate] === true,
  },
  actions: {
    setComplexity: assign({ complexity: (_, event) => event.level }),
  },
  actors: {
    phaseActor: phaseMachine,
  },
}).createMachine({
  id: "luca-workflow",
  initial: "idle",
  context: {
    /* ... */
  },
  states: {
    /* ... */
  },
});
```

This pattern provides:

- Named guards/actions/actors referenced by string in the machine config
- Full TypeScript inference for events, context, params
- Override capability via `machine.provide({...})` for testing

### 1.3 Guards

Guards are pure, synchronous boolean functions that gate transitions:

```typescript
guards: {
  isComplexEnough: ({ context }, params) => {
    return meetsThreshold(context.complexity, params.minLevel);
  },
},
```

XState v5 supports composite guards: `and([...])`, `or([...])`, `not(guard)`.

Guards replace `cond` from v4. They can receive dynamic params:

```typescript
on: {
  EXECUTE: {
    target: 'executing',
    guard: { type: 'isComplexEnough', params: { minLevel: 'MODERATE' } },
  },
}
```

Relevance: Complexity gating matrix, gate config booleans, oversight levels, and safety checks all become XState guards.

### 1.4 Persistence / Snapshots

XState v5 provides built-in persistence:

- **`actor.getPersistedSnapshot()`** -- returns a JSON-serializable representation of internal state (NOT the same as `getSnapshot()`).
- **Restore:** `createActor(machine, { snapshot: persistedState }).start()` -- rehydrates from a persisted snapshot.
- **Deep persistence:** Child actors (invoked/spawned) are recursively persisted. Each child stores: `snapshot`, `src` (logic ID), `systemId`, and `syncSnapshot`.
- **Constraints:** All context values must be JSON-serializable. No functions, classes, or non-serializable values in context.

Persistence workflow:

1. `actor.getPersistedSnapshot()` returns plain object
2. `JSON.stringify(snapshot)` for storage
3. `JSON.parse(stored)` for retrieval
4. `createActor(machine, { snapshot: parsed }).start()` to resume

Relevance: Session resume requires serializing the workflow state to disk (`.planning/state.json`) and rehydrating on session start. The existing `checkpoint.ts` pattern (git tags + JSON metadata) can be extended.

### 1.5 Child Actors (Invoke vs. Spawn)

Two mechanisms for child actors:

- **`invoke`** -- state-bound child actors. Started on state entry, stopped on state exit. Best for finite, known actors (e.g., a specific phase execution).
- **`spawn`** -- action-based dynamic actors. Started/stopped at any time. Best for dynamic collections (e.g., multiple concurrent phases).

For Phase 34, the recommendation is:

- **Invoke** for the active phase lifecycle (one phase at a time is the primary pattern)
- **Spawn** considered for parallel plan execution within a phase (but deferred -- complexity is high and parallelization is already handled at plan level via existing planner)

### 1.6 Event Architecture

Events are plain objects with a `type` string and optional payload:

```typescript
type WorkflowEvent =
  | { type: "START"; ticket_id: string }
  | { type: "PREFLIGHT_COMPLETE"; intuition_flags: string[] }
  | { type: "ROUTE_COMPLETE"; complexity: ComplexityLevel }
  | { type: "PHASE_COMPLETE"; phase_id: number; result: PhaseResult }
  | { type: "VERIFY_COMPLETE"; passed: boolean }
  | { type: "SKIP"; reason: string };
```

Transitions can trigger actions (side effects), including `sendTo()` for inter-actor communication.

### 1.7 TypeScript Requirements

- TypeScript >= 5.0 required (project has `^5.0.0` -- compatible)
- `strict: true` required (project has this -- compatible)
- `strictNullChecks: true` recommended (implied by `strict: true` -- compatible)
- `skipLibCheck: true` recommended (project has this -- compatible)

---

## 2. Current State Management Patterns

### 2.1 Markdown-Based State (STATE.md)

The primary state tracking mechanism is `.planning/STATE.md`, which the LLM reads and writes during workflow execution. It contains:

- **Current position:** milestone, phase, status, complexity, last activity
- **Progress:** ASCII progress bars per phase
- **Git context:** ticket ID, GitHub issue, branch, base branch
- **Previous milestones:** historical summaries
- **Pending todos:** references to todo files
- **Blockers:** current blockers
- **Session continuity:** last session timestamp, resume file
- **Next actions:** ordered list

Problems with this approach:

1. **Token-expensive:** The LLM reads the full file contents to determine state
2. **Non-deterministic:** LLM writes can vary in format, miss fields, or introduce errors
3. **No validation:** No schema enforcement on STATE.md contents
4. **No transitions:** State changes are freeform text edits, not validated transitions
5. **No guards:** Gate checks require the LLM to read config.json and reason about gating rules

### 2.2 WORKING.md (Session Memory)

`.planning/WORKING.md` is active during workflow execution:

- Session info (started, workflow, phase)
- Memory recall notes
- Planning notes
- Status checkboxes (active, learnings extracted, ready to clear)

This is ephemeral per-session state that would become part of the machine context.

### 2.3 config.json (Configuration)

`.planning/config.json` contains deterministic configuration used by the workflow:

- **`cognitive`**: enabled, memory_recall, working_memory, intuition_check, routing
- **`workflow`**: research, plan_check, verifier, code_review, uat_required, etc.
- **`gates`**: confirm_project, confirm_phases, confirm_plan, execute_next_plan, etc.
- **`complexity.matrix`**: The full 5-level gating matrix (maps directly to XState guards)
- **`autopilot`**: oversight level, max_phases_per_session, auto_plan_phases, etc.
- **`harness`**: checks configuration
- **`iteration`**: default_mode, soft_stop_percent, thresholds

These configuration values should feed into the XState machine context and guards. The machine reads config once at startup and encodes the gating rules as guards.

### 2.4 Existing TypeScript State Infrastructure

The codebase already has substantial TypeScript infrastructure for deterministic state operations:

| Module                           | Purpose                                                   | Relevance to XState        |
| -------------------------------- | --------------------------------------------------------- | -------------------------- |
| `src/complexity/`                | ComplexityLevel types, gating matrix, tier resolution     | Guards + context           |
| `src/context/`                   | Context tiers (T0-T3), document assembly, isolation modes | Machine context            |
| `src/iteration/budget.ts`        | Budget state (max_iterations, current, soft_stop)         | Guards for loop control    |
| `src/iteration/checkpoint.ts`    | Git tags + JSON checkpoints, rollback                     | Persistence layer          |
| `src/iteration/convergence.ts`   | Error fingerprinting, Jaccard similarity, stall detection | Guards for iteration loops |
| `src/iteration/classifier.ts`    | Error classification (transient/correctable/permanent)    | Child actor state          |
| `src/context/result-envelope.ts` | Universal ResultEnvelope for agent outputs                | Event payloads             |
| `src/planner/`                   | WSJF scoring, session planning, quality zones             | Machine context            |
| `src/shared/types.ts`            | `Result<T>` discriminated union                           | Return types               |

Key insight: Many of these modules already follow functional patterns with Zod schemas and CLI entry points. The XState machine can compose these existing modules rather than replacing them.

### 2.5 Skill/Agent State Interaction Pattern

Current state interactions follow this pattern:

1. LLM reads STATE.md, WORKING.md, config.json into context
2. LLM reasons about current state and decides next action
3. LLM writes updated STATE.md/WORKING.md
4. Hooks/harness run TypeScript for verification (deterministic)

The target pattern with XState:

1. CLI call reads persisted state: `bun run state get --field=current_phase`
2. CLI call transitions state: `bun run state send --event=PHASE_COMPLETE --data='{"phase_id":34}'`
3. Machine applies guards, transitions, and returns new state as JSON
4. LLM receives structured JSON response, no file parsing needed

### 2.6 Existing CLI Pattern

All existing TypeScript modules expose CLI entry points via `if (import.meta.main)` blocks with `Bun.argv` parsing. Example from `budget.ts`:

```bash
bun run src/iteration/budget.ts create --max-iterations=3 --soft-stop-percent=80
bun run src/iteration/budget.ts advance --state='{ ... }'
```

This pattern should be extended for the XState CLI interface.

---

## 3. Recommended Architecture

### 3.1 Package Structure Decision

**Decision: `src/state-machine/` module within the monorepo, NOT a standalone npm package.**

Rationale:

- The codebase uses `src/` as the single source of truth, compiled to `.claude/` and `.cursor/` via the build system
- Existing modules (`complexity/`, `iteration/`, `context/`) are all `src/` modules, not separate packages
- The state machine needs tight integration with existing types and schemas
- A standalone package would create a circular dependency problem (framework depends on state package, state package needs framework types)
- The `packages/` directory is reserved for distributable packages (`create-luca`, `luca-framework`)
- If standalone distribution is needed later, the module can be extracted via the existing build pipeline

### 3.2 Module Layout

```
src/state-machine/
  index.ts                    # Public API exports
  types.ts                    # Zod schemas + TypeScript types
  machine.ts                  # Main workflow state machine definition
  guards.ts                   # Guard implementations
  actions.ts                  # Action implementations (assign, side effects)
  actors/
    phase-actor.ts            # Child actor for phase lifecycle
    index.ts                  # Actor exports
  persistence.ts              # File-based persistence (serialize/deserialize)
  cli.ts                      # CLI entry point (bun run state ...)
  events.ts                   # Event type definitions
  context.ts                  # Context schema and initialization
  config-loader.ts            # Load config.json into machine context
  __tests__/
    machine.test.ts           # Core machine transition tests
    guards.test.ts            # Guard unit tests
    persistence.test.ts       # Persistence round-trip tests
    cli.test.ts               # CLI integration tests
    phase-actor.test.ts       # Child actor tests
    events.test.ts            # Event schema tests
```

### 3.3 Integration Points

```
                    config.json
                        |
                        v
  CLI (bun run state ...) --> state-machine/cli.ts
                                    |
                                    v
                            state-machine/machine.ts
                            /       |       \
                           v        v        v
                    guards.ts  actions.ts  actors/phase-actor.ts
                       |           |              |
                       v           v              v
              complexity/    context/       iteration/
              (existing)     (existing)      (existing)
                                    |
                                    v
                            persistence.ts
                                    |
                                    v
                        .planning/state.json
```

---

## 4. Implementation Approach Per Requirement

### 4.1 XSTATE-01: Full Workflow Lifecycle State Machine

**State Chart:**

```
idle
  |-- START --> preflight
preflight
  |-- PREFLIGHT_COMPLETE --> routing
  |-- SKIP --> routing (lite preflight)
routing
  |-- ROUTE_COMPLETE --> discussing (if complexity >= MODERATE && discussion != skip)
  |-- ROUTE_COMPLETE --> planning (if discussion == skip)
discussing
  |-- DISCUSS_COMPLETE --> planning
  |-- SKIP --> planning
planning
  |-- PLAN_COMPLETE --> executing
executing (compound state)
  |-- invokes phaseActor
  |-- PHASE_COMPLETE --> verifying
  |-- PHASE_FAILED --> verifying
verifying (compound state)
  |-- harness sub-state
  |-- verifier sub-state
  |-- VERIFY_PASSED --> learning
  |-- VERIFY_FAILED --> executing (retry, guarded by budget)
  |-- VERIFY_HALTED --> paused
learning
  |-- LEARN_COMPLETE --> committing
  |-- SKIP --> committing (if learningCapture == skip)
committing
  |-- COMMIT_COMPLETE --> complete
  |-- COMMIT_COMPLETE --> idle (if more phases, guarded by autopilot config)
complete (final)
paused
  |-- RESUME --> executing
  |-- ABORT --> idle
```

**Implementation:**

```typescript
// src/state-machine/machine.ts
import { setup, assign, createActor } from "xstate";
import type { WorkflowContext, WorkflowEvent } from "./types";
import { workflowGuards } from "./guards";
import { workflowActions } from "./actions";
import { phaseActor } from "./actors/phase-actor";

export const workflowMachine = setup({
  types: {
    context: {} as WorkflowContext,
    events: {} as WorkflowEvent,
  },
  guards: workflowGuards,
  actions: workflowActions,
  actors: { phaseActor },
}).createMachine({
  id: "luca-workflow",
  initial: "idle",
  context: ({ input }) => initializeContext(input),
  states: {
    idle: {
      /* ... */
    },
    preflight: {
      /* ... */
    },
    routing: {
      /* ... */
    },
    discussing: {
      /* ... */
    },
    planning: {
      /* ... */
    },
    executing: {
      /* ... invoke phaseActor ... */
    },
    verifying: {
      /* compound: harness -> verifier */
    },
    learning: {
      /* ... */
    },
    committing: {
      /* ... */
    },
    complete: { type: "final" },
    paused: {
      /* ... */
    },
  },
});
```

**Context schema (Zod):**

```typescript
// src/state-machine/types.ts
export const workflowContextSchema = z.object({
  // Identity
  session_id: z.string(),
  ticket_id: z.string().optional(),
  github_issue: z.number().optional(),
  branch: z.string().optional(),
  base_branch: z.string().default("main"),

  // Workflow state
  current_milestone: z.string().optional(),
  current_phase: z.number().optional(),
  complexity: complexityLevelSchema.default("TRIVIAL"),
  oversight: z
    .enum(["full-auto", "milestone", "phase", "plan"])
    .default("milestone"),

  // Configuration (loaded from config.json)
  gates: z.record(z.boolean()).default({}),
  workflow_config: z.record(z.any()).default({}),
  complexity_matrix: z.record(z.any()).default({}),
  autopilot_config: z.record(z.any()).default({}),

  // Execution state
  phase_results: z.array(phaseResultSchema).default([]),
  harness_result: harnessResultRefSchema.optional(),
  verification_attempts: z.number().default(0),
  max_verification_attempts: z.number().default(3),

  // Iteration budget
  iteration_budget: budgetStateSchema.optional(),

  // Memory / cognitive
  intuition_flags: z.array(z.string()).default([]),
  memory_tags: z.array(z.string()).default([]),

  // Timestamps
  started_at: z.string().optional(),
  last_transition_at: z.string().optional(),
});

export type WorkflowContext = z.infer<typeof workflowContextSchema>;
```

### 4.2 XSTATE-02: Callable CLI Functions

**CLI Interface Design:**

```bash
# Query state
bun run src/state-machine/cli.ts get                          # Full state snapshot
bun run src/state-machine/cli.ts get --field=complexity       # Single field
bun run src/state-machine/cli.ts get --field=current_phase    # Single field
bun run src/state-machine/cli.ts status                       # Human-readable status

# Send events (transitions)
bun run src/state-machine/cli.ts send --event=START --data='{"ticket_id":"PROJ-1234"}'
bun run src/state-machine/cli.ts send --event=PHASE_COMPLETE --data='{"phase_id":34}'
bun run src/state-machine/cli.ts send --event=VERIFY_PASSED

# Lifecycle
bun run src/state-machine/cli.ts init --config=.planning/config.json  # Create new session
bun run src/state-machine/cli.ts resume                                # Resume from disk
bun run src/state-machine/cli.ts reset                                 # Reset to idle
```

**Implementation:**

```typescript
// src/state-machine/cli.ts
if (import.meta.main) {
  const subcommand = Bun.argv[2];

  switch (subcommand) {
    case "get": {
      const actor = await loadPersistedActor();
      const field = getArg("field");
      if (field) {
        console.log(JSON.stringify(get(actor.getSnapshot().context, field)));
      } else {
        console.log(JSON.stringify(actor.getSnapshot(), null, 2));
      }
      actor.stop();
      break;
    }
    case "send": {
      const actor = await loadPersistedActor();
      const event = buildEvent(getArg("event"), getArg("data"));
      actor.send(event);
      await persistActor(actor);
      console.log(
        JSON.stringify(
          {
            state: actor.getSnapshot().value,
            context: actor.getSnapshot().context,
          },
          null,
          2,
        ),
      );
      actor.stop();
      break;
    }
    case "init": {
      /* ... */ break;
    }
    case "resume": {
      /* ... */ break;
    }
    case "reset": {
      /* ... */ break;
    }
  }
}
```

Each CLI call is stateless from the process perspective: load persisted state, create actor, perform operation, persist, exit. This avoids the need for a long-running daemon and aligns with the existing CLI pattern.

### 4.3 XSTATE-03: State Persistence

**Persistence Layer:**

```typescript
// src/state-machine/persistence.ts
const STATE_FILE = ".planning/state.json";

export async function persistActor(actor: AnyActorRef): Promise<void> {
  const snapshot = actor.getPersistedSnapshot();
  const serialized = JSON.stringify(snapshot, null, 2);
  await Bun.write(STATE_FILE, serialized);
}

export async function loadPersistedActor(): Promise<
  Actor<typeof workflowMachine>
> {
  const file = Bun.file(STATE_FILE);

  if (await file.exists()) {
    const raw = await file.json();
    const actor = createActor(workflowMachine, { snapshot: raw });
    actor.start();
    return actor;
  }

  // No persisted state -- create fresh
  const config = await loadConfig();
  const actor = createActor(workflowMachine, {
    input: { config },
  });
  actor.start();
  return actor;
}

export async function clearPersistedState(): Promise<void> {
  const file = Bun.file(STATE_FILE);
  if (await file.exists()) {
    await Bun.write(STATE_FILE, "");
  }
}
```

**Key considerations:**

- Use `.planning/state.json` to coexist with `.planning/STATE.md` (backward compatibility)
- Persistence happens after every `send` call (crash safety)
- Deep persistence handles child actors (phase actor state is included)
- All context values must be JSON-serializable (no functions, no Date objects -- use ISO strings)
- The existing `checkpoint.ts` pattern (git tags + JSON) remains for iteration checkpoints; `state.json` is for the workflow machine

### 4.4 XSTATE-04: Transition Guards

Guards encode the complexity gating matrix, gate config booleans, oversight levels, and safety checks. They replace LLM reasoning about tables and config.

**Guard implementations:**

```typescript
// src/state-machine/guards.ts
import { meetsThreshold } from "../complexity";

export const workflowGuards = {
  // Complexity gating
  shouldRunResearch: ({ context }) => {
    const gate = context.complexity_matrix[context.complexity];
    return gate?.research === "required" || gate?.research === "run";
  },

  shouldRunDiscussion: ({ context }) => {
    const gate = context.complexity_matrix[context.complexity];
    return gate?.discussion !== "skip";
  },

  shouldRunUAT: ({ context }) => {
    const gate = context.complexity_matrix[context.complexity];
    return gate?.uat === "required" || gate?.uat === "required+thorough";
  },

  // Gate config
  gateEnabled: ({ context }, params: { gate: string }) => {
    return context.gates[params.gate] === true;
  },

  // Oversight
  needsHumanApproval: ({ context }) => {
    return context.oversight === "plan" || context.oversight === "phase";
  },

  // Budget
  withinBudget: ({ context }) => {
    if (!context.iteration_budget) return true;
    return shouldStartIteration(context.iteration_budget).allowed;
  },

  // Verification
  canRetryVerification: ({ context }) => {
    return context.verification_attempts < context.max_verification_attempts;
  },

  // Safety
  isDestructiveAction: ({ context, event }) => {
    return context.workflow_config.always_confirm_destructive === true;
  },

  // Complexity threshold
  meetsComplexityThreshold: ({ context }, params: { min: ComplexityLevel }) => {
    return meetsThreshold(context.complexity, params.min);
  },
};
```

**Usage in machine definition:**

```typescript
routing: {
  on: {
    ROUTE_COMPLETE: [
      {
        target: 'discussing',
        guard: 'shouldRunDiscussion',
        actions: 'setComplexity',
      },
      {
        target: 'planning',
        actions: 'setComplexity',
      },
    ],
  },
},
```

### 4.5 XSTATE-05: Event-Driven Architecture

Events emitted during transitions can be observed by hooks and skills via the actor subscription mechanism:

```typescript
// src/state-machine/events.ts
export type WorkflowEvent =
  | { type: "START"; ticket_id?: string; config_path?: string }
  | { type: "PREFLIGHT_COMPLETE"; intuition_flags: string[] }
  | { type: "ROUTE_COMPLETE"; complexity: ComplexityLevel }
  | { type: "DISCUSS_COMPLETE"; summary: string }
  | { type: "PLAN_COMPLETE"; plan_id: string }
  | { type: "PHASE_START"; phase_id: number }
  | { type: "PHASE_COMPLETE"; phase_id: number; result: PhaseResult }
  | { type: "PHASE_FAILED"; phase_id: number; error: string }
  | { type: "HARNESS_COMPLETE"; result: HarnessResult }
  | { type: "VERIFY_PASSED" }
  | { type: "VERIFY_FAILED"; gaps: string[] }
  | { type: "VERIFY_HALTED"; reason: string }
  | { type: "LEARN_COMPLETE"; learnings: string[] }
  | { type: "COMMIT_COMPLETE"; commit_hash: string }
  | { type: "SKIP"; reason: string }
  | { type: "RESUME" }
  | { type: "ABORT"; reason: string }
  | { type: "RESET" };
```

**Hook integration pattern:**

The CLI fires events, the machine transitions, and hooks observe transitions. Rather than complex pub/sub, the CLI outputs structured JSON that includes the transition details:

```json
{
  "previous_state": "executing",
  "current_state": "verifying",
  "event": "PHASE_COMPLETE",
  "context": { "current_phase": 34, "complexity": "COMPLEX" },
  "actions_executed": ["recordPhaseResult", "resetVerificationAttempts"]
}
```

Existing hooks (post-edit, pre-commit) continue operating at the tool level. The state machine provides a higher-level orchestration layer. Phase 35 (Integration) will wire hooks to emit/respond to machine events.

### 4.6 XSTATE-06: Child Actor Model

**Phase Actor:**

A child machine modeling the lifecycle of a single phase execution:

```
phase-idle
  |-- PLAN_WAVE --> wave-executing
wave-executing
  |-- WAVE_COMPLETE --> wave-evaluating
wave-evaluating
  |-- MORE_WAVES --> wave-executing
  |-- ALL_WAVES_DONE --> phase-verifying
phase-verifying
  |-- PHASE_PASSED --> phase-done
  |-- PHASE_FAILED --> phase-fixing (guarded by budget)
  |-- PHASE_HALTED --> phase-blocked
phase-fixing
  |-- FIX_COMPLETE --> phase-verifying
phase-done (final)
phase-blocked (final)
```

```typescript
// src/state-machine/actors/phase-actor.ts
export const phaseActorMachine = setup({
  types: {
    context: {} as PhaseContext,
    events: {} as PhaseEvent,
    input: {} as PhaseInput,
  },
  guards: {
    withinFixBudget: ({ context }) => {
      return context.fix_iterations < context.max_fix_iterations;
    },
    hasMoreWaves: ({ context }) => {
      return context.current_wave < context.total_waves;
    },
  },
}).createMachine({
  id: "phase",
  initial: "idle",
  context: ({ input }) => ({
    phase_id: input.phase_id,
    plan_ids: input.plan_ids,
    current_wave: 0,
    total_waves: input.total_waves,
    fix_iterations: 0,
    max_fix_iterations: input.max_fix_iterations,
    wave_results: [],
  }),
  states: {
    idle: { on: { PLAN_WAVE: "wave_executing" } },
    wave_executing: {
      /* ... */
    },
    wave_evaluating: {
      always: [
        { target: "wave_executing", guard: "hasMoreWaves" },
        { target: "phase_verifying" },
      ],
    },
    phase_verifying: {
      /* ... */
    },
    phase_fixing: {
      /* ... */
    },
    phase_done: { type: "final" },
    phase_blocked: { type: "final" },
  },
});
```

The parent `workflowMachine` invokes the phase actor:

```typescript
executing: {
  invoke: {
    id: 'phase',
    src: 'phaseActor',
    input: ({ context }) => ({
      phase_id: context.current_phase,
      plan_ids: context.current_plan_ids,
      total_waves: context.current_wave_count,
      max_fix_iterations: context.complexity_matrix[context.complexity]?.harnessFixIterations ?? 3,
    }),
    onDone: {
      target: 'verifying',
      actions: 'recordPhaseResult',
    },
    onError: {
      target: 'paused',
      actions: 'recordPhaseError',
    },
  },
},
```

---

## 5. Risks and Mitigation

### 5.1 Risk: Bun Cold-Start Latency for CLI Calls

**Description:** Each `bun run state send ...` call spawns a new Bun process, loads the XState library, reads `state.json`, creates the actor, processes the event, persists, and exits. If this adds >500ms per invocation, it could slow down the workflow.

**Mitigation:**

- Bun has very fast cold-start (~20ms). XState is ~50KB. JSON read/write is fast.
- Benchmark early: if latency exceeds 200ms, consider a persistent MCP server alternative.
- The existing `checkpoint.ts` and `budget.ts` CLI patterns already work well with Bun cold-start.

### 5.2 Risk: Context Serialization Constraints

**Description:** XState requires all context values to be JSON-serializable. No Map, Set, Date, RegExp, or function values in context.

**Mitigation:**

- Use ISO 8601 strings for timestamps (already the codebase convention)
- Use plain objects/arrays instead of Map/Set
- Use Zod schemas to validate context shape at persistence boundaries
- The existing codebase already uses JSON-serializable patterns throughout

### 5.3 Risk: Machine Logic Divergence from Markdown Descriptions

**Description:** The workflow is currently described in skill markdown files (workflow-start, phase-execute, etc.). If the XState machine and the markdown descriptions diverge, the LLM could follow outdated instructions.

**Mitigation:**

- Phase 35 (Integration) explicitly addresses this by wiring skills to the state machine
- During Phase 34, keep the machine as the "source of truth" but do not modify skill files
- Add machine state assertion at the CLI level (e.g., "current state is X, allowed events are Y")
- Generate human-readable state descriptions from the machine for STATE.md backward compatibility

### 5.4 Risk: XState v5 API Stability

**Description:** XState v5 was released in late 2023. While stable, there may be edge cases with deep persistence or complex guard compositions.

**Mitigation:**

- Pin `xstate` to a specific version in `package.json`
- Write comprehensive tests for persistence round-trips, guard combinations, and child actor lifecycle
- Avoid experimental features; stick to documented patterns

### 5.5 Risk: Complexity of Phase 34 Scope

**Description:** 6 requirements spanning machine design, CLI interface, persistence, guards, events, and child actors is substantial for a single phase.

**Mitigation:**

- Split into 3-4 plans:
  - Plan 34-01: Core machine + types + guards (XSTATE-01, XSTATE-04)
  - Plan 34-02: CLI interface + persistence (XSTATE-02, XSTATE-03)
  - Plan 34-03: Child actor model + events (XSTATE-05, XSTATE-06)
  - Plan 34-04: Integration tests + documentation
- Each plan is independently testable and verifiable
- Target ~250-300 test assertions across the phase

### 5.6 Risk: Existing Classes in Base Skill/Agent/Rule

**Description:** The codebase has `BaseSkillImpl`, `BaseRuleImpl`, and `BaseAgentImpl` classes. The no-classes rule says to migrate these to functional patterns. The state machine module must use functional patterns exclusively.

**Mitigation:**

- The state machine module will be 100% functional (XState's `setup()` + `createMachine()` is already functional -- no classes needed)
- Existing class-based code is a known tech debt item; state machine does not depend on or extend these classes
- The `setup()` pattern with named guards/actions/actors is inherently functional

---

## 6. Dependencies

### 6.1 npm Package

```bash
bun add xstate
```

Current XState v5 version: `5.19.x` (latest stable as of early 2026).

No additional packages needed. XState has zero runtime dependencies.

### 6.2 Dev Dependencies

No additional dev dependencies required. The existing `@types/bun`, `typescript`, and `bun:test` cover all needs.

### 6.3 Internal Dependencies

The state machine module imports from existing `src/` modules:

| Import                                | Source                    | Purpose                     |
| ------------------------------------- | ------------------------- | --------------------------- |
| `ComplexityLevel`, `meetsThreshold`   | `src/complexity/`         | Guard implementations       |
| `BudgetState`, `shouldStartIteration` | `src/iteration/budget.ts` | Loop budget guards          |
| `HarnessResult`                       | `src/harness/types.ts`    | Event payloads              |
| `Result<T>`                           | `src/shared/types.ts`     | Return types                |
| `z` (Zod)                             | `zod`                     | Schema definitions          |
| `get`                                 | `lodash/get`              | Context field access in CLI |

---

## 7. Testing Strategy

### 7.1 Unit Tests

| Test File             | Coverage                                                      |
| --------------------- | ------------------------------------------------------------- |
| `machine.test.ts`     | All state transitions, happy path + edge cases                |
| `guards.test.ts`      | Each guard with boundary conditions                           |
| `persistence.test.ts` | Serialize/deserialize round-trips, child actors, corrupt data |
| `phase-actor.test.ts` | Phase lifecycle, budget exhaustion, wave progression          |
| `events.test.ts`      | Event schema validation                                       |
| `context.test.ts`     | Context initialization, config loading                        |
| `cli.test.ts`         | CLI subcommands with mocked file system                       |

### 7.2 Test Patterns

```typescript
import { test, expect } from "bun:test";
import { createActor } from "xstate";
import { workflowMachine } from "../machine";

test("transitions from idle to preflight on START", () => {
  const actor = createActor(workflowMachine);
  actor.start();

  actor.send({ type: "START", ticket_id: "PROJ-1234" });

  expect(actor.getSnapshot().value).toBe("preflight");
  expect(actor.getSnapshot().context.ticket_id).toBe("PROJ-1234");

  actor.stop();
});

test("skips discussion when complexity is TRIVIAL", () => {
  const actor = createActor(workflowMachine);
  actor.start();

  actor.send({ type: "START" });
  actor.send({ type: "PREFLIGHT_COMPLETE", intuition_flags: [] });
  actor.send({ type: "ROUTE_COMPLETE", complexity: "TRIVIAL" });

  // Should skip discussing and go to planning
  expect(actor.getSnapshot().value).toBe("planning");

  actor.stop();
});

test("persistence round-trip preserves state", async () => {
  const actor = createActor(workflowMachine);
  actor.start();
  actor.send({ type: "START", ticket_id: "PROJ-1234" });
  actor.send({ type: "PREFLIGHT_COMPLETE", intuition_flags: ["RISK"] });

  const persisted = actor.getPersistedSnapshot();
  actor.stop();

  // Restore
  const restored = createActor(workflowMachine, { snapshot: persisted });
  restored.start();

  expect(restored.getSnapshot().value).toBe("routing");
  expect(restored.getSnapshot().context.ticket_id).toBe("PROJ-1234");
  expect(restored.getSnapshot().context.intuition_flags).toEqual(["RISK"]);

  restored.stop();
});
```

### 7.3 Test Count Estimate

Based on the scope and complexity:

- Core machine transitions: ~40 tests
- Guard implementations: ~30 tests
- Persistence: ~15 tests
- Phase actor: ~20 tests
- CLI interface: ~15 tests
- Event schemas: ~10 tests
- Context/config: ~10 tests
- **Total estimate: ~140 tests**

---

## 8. Plan Breakdown Recommendation

Based on the complexity matrix (COMPLEX level, effort 8), the phase should be split into 3-4 plans:

### Plan 34-01: Core Machine + Types + Guards

**Requirements:** XSTATE-01 (partial), XSTATE-04
**Scope:**

- Define `WorkflowContext` and `WorkflowEvent` Zod schemas
- Implement the main `workflowMachine` with all states and transitions
- Implement all guard functions
- Implement action functions (context updates via `assign`)
- Unit tests for transitions and guards
  **Estimated tests:** ~70

### Plan 34-02: Persistence + CLI Interface

**Requirements:** XSTATE-02, XSTATE-03
**Scope:**

- Implement file-based persistence (`state.json`)
- Implement CLI entry point with `get`, `send`, `init`, `resume`, `reset` subcommands
- Persistence round-trip tests
- CLI integration tests
  **Estimated tests:** ~30

### Plan 34-03: Child Actor Model + Events

**Requirements:** XSTATE-05, XSTATE-06
**Scope:**

- Implement `phaseActorMachine` with wave/verification lifecycle
- Wire phase actor into main machine via `invoke`
- Define event schemas with Zod validation
- Event-driven output format for hook integration
- Unit tests for phase actor and events
  **Estimated tests:** ~40

---

## 9. Key Design Decisions

### 9.1 CLI-per-call vs. Long-running Daemon

**Decision:** CLI-per-call (stateless process, load-act-persist-exit).

**Rationale:**

- Aligns with existing codebase patterns (budget.ts, checkpoint.ts, convergence.ts)
- Bun cold-start is fast enough (~20-50ms)
- No daemon management complexity
- No IPC complexity
- Each call is isolated and testable
- If performance becomes an issue, an MCP server can be added later (Phase 35+)

### 9.2 State File Location

**Decision:** `.planning/state.json`

**Rationale:**

- Coexists with `.planning/STATE.md` (backward compatibility during Phase 35 integration)
- Within `.planning/` which is gitignored for ephemeral state
- Consistent with `.planning/config.json` location
- Clear separation from compiled outputs (`.claude/`, `.cursor/`)

### 9.3 Guard Composition Strategy

**Decision:** Guards implemented as pure functions in `guards.ts`, registered via `setup()`, referenced by string name in machine config.

**Rationale:**

- Full TypeScript inference via `setup()`
- Testable in isolation (pure functions)
- Overridable via `machine.provide()` for testing
- Named guards make machine config readable
- Complexity matrix lookup is a single object access, not LLM reasoning

### 9.4 Functional Patterns Only

**Decision:** No classes anywhere in the state machine module. Factory functions, closures, and XState's built-in functional APIs only.

**Rationale:**

- Project rule: no-classes
- XState v5's `setup()` + `createMachine()` is inherently functional
- Guards and actions are plain functions
- Persistence uses module-level functions
- CLI uses `if (import.meta.main)` pattern (no class instantiation)

### 9.5 Zod Schemas for Context and Events

**Decision:** All context types and event types defined as Zod schemas with `z.infer<>` for TypeScript types.

**Rationale:**

- Project rule: schema-first-parsing
- Runtime validation at persistence boundaries
- Consistent with every other module in the codebase
- Enables validation of CLI input (`--data='...'`)

---

## 10. Open Questions

### 10.1 Should state.json be gitignored or committed?

**Recommendation:** Gitignored (ephemeral session state). The machine can generate a human-readable STATE.md snapshot on each transition for committed state.

### 10.2 How should the machine handle mid-session crashes?

**Recommendation:** Persist after every transition. On resume, rehydrate from `state.json`. If `state.json` is corrupted, fall back to `idle` state with a warning.

### 10.3 Should the phase actor handle individual plan execution?

**Recommendation:** Not in Phase 34. The phase actor models the phase lifecycle (waves, verification, fixing). Individual plan execution remains LLM-driven. Phase 35 (Integration) can add plan-level tracking if needed.

### 10.4 What happens to existing STATE.md content?

**Recommendation:** During Phase 34, STATE.md continues to be written by the LLM as before. During Phase 35 (Integration), STATE.md becomes a generated snapshot from machine state. Historical sections (milestones, todos) remain human-curated.

---

## 11. References

### XState v5 Documentation

- [Actors](https://stately.ai/docs/actors)
- [State Machines](https://stately.ai/docs/machines)
- [Guards](https://stately.ai/docs/guards)
- [Events and Transitions](https://stately.ai/docs/transitions)
- [Persistence](https://stately.ai/docs/persistence)
- [Setup](https://stately.ai/docs/setup)
- [TypeScript](https://stately.ai/docs/typescript)
- [Spawn](https://stately.ai/docs/spawn)
- [Invoke](https://stately.ai/docs/invoke)
- [Migration v4 to v5](https://stately.ai/docs/migration)

### XState Resources

- [XState v5 Announcement](https://stately.ai/blog/2023-12-01-xstate-v5)
- [Persisting and Restoring State](https://stately.ai/blog/2023-10-02-persisting-state)
- [Persistence Deep Wiki](https://deepwiki.com/statelyai/xstate/2.8-persistence-and-rehydration)
- [GitHub Repository](https://github.com/statelyai/xstate)

### Codebase References

- `src/complexity/` -- Complexity levels, gating matrix, tier resolution
- `src/iteration/budget.ts` -- Budget state management
- `src/iteration/checkpoint.ts` -- Git-based checkpoints and persistence
- `src/iteration/convergence.ts` -- Convergence detection
- `src/context/` -- Context tiers, document assembly
- `src/harness/` -- Verification harness
- `src/shared/types.ts` -- Result<T> discriminated union
- `.planning/config.json` -- Workflow configuration
- `.planning/STATE.md` -- Current state management
- `.planning/todos/pending/xstate-workflow-state-package.md` -- Original todo
- `.planning/todos/pending/ts-driven-state-management-llm-offloading.md` -- Related todo

---

_Research completed: 2026-02-14_
_Phase: 34 (XState Core Machine)_
_Complexity: COMPLEX_
_Researcher: lu-phase-researcher_
