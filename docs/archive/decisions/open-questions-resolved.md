# Open Questions -- Resolved

**Date:** 2026-03-24
**Status:** All resolved

## Question 1: DAG granularity

**Question:** What is the right granularity for DAG steps?

**Options considered:**

- (a) One step per current skill invocation
- (b) Finer-grained steps within skills (e.g., "research" and "execute" as separate steps)
- (c) Coarser steps that group related skills

**Decision:** Option (a) -- one step per current skill invocation.

**Rationale:**

1. The current workflow already has well-defined phase boundaries: classify, discuss, plan, execute, verify, learn, commit. Each maps to a skill invocation. These are the natural DAG steps.
2. Option (b) creates premature granularity. The skills internally manage their own sub-steps (e.g., phase-execute manages wave iteration). Splitting them into finer DAG steps would require extracting implicit state passing that currently happens within a single skill context.
3. Option (c) loses the retry granularity benefit. If "plan + execute" is a single step, you cannot retry execute without re-running plan.
4. The step contract schemas (ClassifyOutput, DiscussOutput, etc.) map cleanly to skill boundaries because that is where data handoff already occurs.

**Impact:** The `phasePipeline` DAG has 7 primary steps: classify -> discuss -> plan -> execute -> verify -> learn -> commit. All steps run at every complexity level; conditional edges only handle explicit flag-based skipping (e.g., --skip-discuss). Complexity controls model tier, not step activation. The execute step internally manages wave iteration using `src/iteration/` helpers.

## Question 2: Oversight gate modeling

**Question:** How do human oversight gates map to DAG constructs?

**Decision:** Option (c) -- out-of-band signaling via state machine events.

**Rationale:**

1. Oversight gates (approval prompts, review requests) are already modeled as state machine events: `VERIFY_HALTED` transitions to `paused` state, `RESUME` transitions back to `executing`. This mechanism works and is battle-tested.
2. Adding a special "gate" node type (option a) to the DAG would duplicate the state machine's role. The state machine IS the gate system.
3. Conditional edges (option b) are compile-time constructs. Oversight decisions are runtime decisions that depend on human input, which cannot be encoded in static DAG edges.

**Implementation:** When the DAG executor reaches a step that requires human oversight (based on complexity level and `verification_mode` from complexity matrix):

1. The executor sends `VERIFY_HALTED` event to the state machine with a `reason` field
2. The state machine transitions to `paused`
3. The executor polls `luca-bridge read-status` until state changes from `paused`
4. On `RESUME` event (sent by human), the executor continues to the next step

No DAG schema changes needed. Gates are external to the DAG definition.

## Question 3: Swarm mode mapping

**Question:** How does swarm/parallel execution map to DAG constructs?

**Decision:** The DAG structure is STATIC (defined at plan time). Swarm mode is modeled as a DAG variant with wider parallel groups, not as dynamic fan-out.

**Rationale:**

1. Dynamic fan-out (modifying the DAG during execution) introduces enormous complexity: step contracts may not match, retry logic becomes non-deterministic, and checkpoint/resume breaks if the DAG shape changes between suspension and resumption.
2. The DAG's `parallelGroups` concept already supports parallelism via independent branches. A "swarm" variant of the pipeline can be defined as a DAG where execute steps for independent tasks run in parallel waves.
3. The v2 pipeline's "4 parallel researcher agents" (v2-phase-1) maps cleanly to a parallel group of 4 research steps in a static DAG.

**Implementation:** Create a `swarmPipeline` DAG definition alongside `phasePipeline` that has wider parallel groups for the execute phase. The orchestrator selects the appropriate DAG variant based on config (`workflow.parallel_mode: "sequential" | "swarm"`). Both variants have the same step types and contracts -- they differ only in parallel grouping.

## Question 4: Migration coexistence strategy

**Question:** How do prose and DAG orchestration coexist during transition?

**Decision:** Feature flag `workflow.engine: "prose" | "dag"` in `.planning/config.json`. Per-session switching. Default is `"prose"`.

**Rationale:** See X03 Decision 3 for full rationale. Summary: per-session switching prevents the debugging nightmare of two orchestration systems running simultaneously. The `/lu` entry point reads the flag and dispatches to either lu.skill.ts (prose) or the DAG executor.

**Transition timeline:**

1. Phase A ships: `engine: "dag"` is available but not default
2. Behavioral equivalence criteria (X05) are validated
3. Default flips to `"dag"`
4. After 2 weeks without issues, prose path is removed

## Question 5: Adapter discovery mechanism

**Question:** How does the build system discover available adapters?

**Decision:** Option (a) -- explicit registry in `src/adapters/index.ts`.

**Rationale:**

1. Filesystem scanning (option b) is fragile -- it depends on directory naming conventions and can discover incomplete/broken adapters.
2. Config-driven (option c) adds unnecessary indirection -- the adapters are compile-time artifacts, not runtime plugins.
3. An explicit registry is type-safe, easy to understand, and follows the existing pattern used by `agentRegistry`, `skillRegistry`, and `ruleRegistry` in entity domains.

**Implementation:**

```typescript
// src/adapters/index.ts
import { claudeAdapter } from "./claude";
import { cursorAdapter } from "./cursor";
import { windsurfAdapter } from "./windsurf";
import { vscodeAdapter } from "./vscode";

import type { Adapter } from "~/workflow";

export const adapterRegistry: Map<string, Adapter> = new Map([
  ["claude", claudeAdapter],
  ["cursor", cursorAdapter],
  ["windsurf", windsurfAdapter],
  ["vscode", vscodeAdapter],
]);

/**
 * Resolve an adapter by ID.
 *
 * @param id - Adapter identifier (e.g., "claude", "cursor")
 * @returns The adapter instance, or undefined if not found
 */
export function resolveAdapter(id: string): Adapter | undefined {
  return adapterRegistry.get(id);
}

/**
 * Get all registered adapter IDs.
 *
 * @returns Array of registered adapter ID strings
 */
export function getAdapterIds(): string[] {
  return Array.from(adapterRegistry.keys());
}
```

**CLI integration:** `bun run build:all --adapter=cursor` calls `resolveAdapter("cursor")`. `bun run build:all --adapter=all` iterates `getAdapterIds()`.
