# Phase 18 Research: Usage-Aware Sprint Planner

## Research Summary

This document captures codebase research findings for implementing Phase 18 (Usage-Aware Sprint Planner). The research covers module patterns, agent definitions, todo file structures, integration points, and build pipeline requirements.

---

## 1. Module Pattern Reference (from `src/iteration/`)

### File Structure

The `src/iteration/` module (Phase 17) is the canonical reference for `src/planner/`. It contains:

```
src/iteration/
  types.ts              # All Zod schemas and TypeScript types (sole type source)
  convergence.ts        # Pure functions + CLI entry point
  classifier.ts         # Pure functions + CLI entry point
  budget.ts             # Pure functions + CLI entry point
  checkpoint.ts         # Async functions (git/fs) + CLI entry point
  index.ts              # Re-exports (schemas, types, functions)
  types.test.ts         # Schema validation tests
  convergence.test.ts   # Function unit tests
  classifier.test.ts    # Function unit tests
  budget.test.ts        # Function unit tests
  checkpoint.test.ts    # Async integration tests
```

### Recommended `src/planner/` File Structure

Following the iteration module pattern:

```
src/planner/
  types.ts              # Zod schemas: WSJFScore, SessionPlan, WeeklyPlan, QualityZone, etc.
  defaults.ts           # Default values: effort point mappings, zone boundaries, weekly ratios
  scoring.ts            # WSJF calculation utilities + CLI entry point
  scheduler.ts          # Big Rock First + WSJF tail scheduling + CLI entry point
  index.ts              # Re-exports
  types.test.ts         # Schema validation tests
  scoring.test.ts       # WSJF scoring unit tests
  scheduler.test.ts     # Scheduling algorithm unit tests
  defaults.test.ts      # Default configuration tests
```

### Pattern Details

#### Zod Schema Conventions

All schemas in `src/iteration/types.ts` follow this exact pattern:

1. **Constants array first** with `as const`:

   ```typescript
   export const ERROR_CLASSES = [
     "transient",
     "correctable",
     "permanent",
   ] as const;
   ```

2. **Zod enum from constants**:

   ```typescript
   export const errorClassSchema = z.enum(ERROR_CLASSES);
   ```

3. **Type derived from schema**:

   ```typescript
   export type ErrorClass = z.infer<typeof errorClassSchema>;
   ```

4. **Object schemas use snake_case** for data schema compatibility:

   ```typescript
   export const classifiedErrorSchema = z.object({
     fingerprint: errorFingerprintSchema,
     source: z.string(),
     classification: errorClassSchema,
     iterations_seen: z.number().int().nonnegative(),
     // ...
   });
   export type ClassifiedError = z.infer<typeof classifiedErrorSchema>;
   ```

5. **Config schemas have `.default()` values** for optional fields:
   ```typescript
   export const iterationConfigSchema = z.object({
     default_mode: iterationModeSchema.default("afk"),
     soft_stop_percent: z.number().min(0).max(100).default(80),
     stale_threshold: z.number().int().positive().default(2),
     promotion_threshold: z.number().int().positive().default(3),
   });
   ```

#### CLI Entry Point Pattern

Each utility file includes a CLI entry point guarded by `import.meta.main`:

```typescript
if (import.meta.main) {
  const args = Bun.argv.slice(2);

  function getArg(name: string, defaultValue: string = ""): string {
    const prefix = `--${name}=`;
    const arg = args.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
  }

  try {
    // Parse args, call functions, JSON.stringify output to stdout
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}
```

For files with multiple operations (like `budget.ts` and `checkpoint.ts`), a subcommand pattern is used:

```typescript
if (import.meta.main) {
  const subcommand = Bun.argv[2];
  const args = Bun.argv.slice(3);
  // switch (subcommand) { case "create": ... case "assess": ... }
}
```

#### Export Pattern (`index.ts`)

The index file separates schema/constant exports from type exports from function exports:

```typescript
// Types and schemas
export {
  ERROR_CLASSES,
  errorClassSchema,
  classifiedErrorSchema,
  // ...
} from "./types";

export type {
  ErrorClass,
  ClassifiedError,
  // ...
} from "./types";

// Convergence detection (functions)
export {
  createFingerprint,
  computeFingerprintOverlap,
  // ...
} from "./convergence";

// Budget tracking (functions)
export {
  createBudgetState,
  assessBudget,
  // ...
} from "./budget";
```

#### Test File Pattern

Tests use `bun:test` with `describe`/`test`/`expect`:

```typescript
import { describe, test, expect } from "bun:test";
import { createBudgetState, assessBudget } from "./budget";

describe("createBudgetState", () => {
  test("creates state with correct defaults (soft_stop_percent=80)", () => {
    const state = createBudgetState(3);
    expect(state.max_iterations).toBe(3);
    expect(state.soft_stop_percent).toBe(80);
  });
});
```

Key conventions:

- Test files are co-located (same directory as source)
- Test file naming: `{module}.test.ts`
- Pure functions tested with simple input/output assertions
- Immutability explicitly tested (`expect(advanced).not.toBe(initial)`)
- Edge cases systematically covered

#### Immutability Pattern

All state-mutation functions return new objects:

```typescript
export function advanceBudget(state: BudgetState): BudgetState {
  const nextState: BudgetState = {
    ...state,
    current_iteration: state.current_iteration + 1,
    status: "under_budget", // placeholder
  };
  nextState.status = assessBudget(nextState);
  return nextState;
}
```

#### Function Documentation (JSDoc)

Every exported function has comprehensive JSDoc with `@param`, `@returns`, and `@example`:

````typescript
/**
 * Create an initial budget state for an iteration loop.
 *
 * @param maxIterations - Maximum iterations allowed (from ComplexityGate)
 * @param softStopPercent - Percentage threshold for soft stop (default 80)
 * @returns Initialized BudgetState with current_iteration=0 and status=under_budget
 *
 * @example
 * ```typescript
 * const budget = createBudgetState(3);
 * ```
 */
````

---

## 2. Agent Definition Reference

### Two Agent Directory Trees

The codebase has two distinct agent directories:

1. **`src/agents/general/`** -- Agents registered in `agentRegistry` (compiled via registry loop)
2. **`src/agents/luca/`** -- Luca-specific agents (compiled individually in `build-all.ts`)

### Agent Config Structure

Every agent uses `AgentConfig` from `src/agents/types/agent.types.ts`:

```typescript
export interface AgentConfig {
  frontmatter: AgentFrontmatter;
  sections: AgentSection[];
}

export interface AgentFrontmatter {
  name: string;
  description: string;
  tools?: string[];
  color?: string;
  cognition?: CognitionConfig;
  context?: ContextConfig;
  [key: string]: unknown;
}

export interface AgentSection {
  title: string;
  content: string;
  order?: number;
}
```

### Zod Validation at Init

The `src/agents/luca/lu-planner.agent.ts` validates config at module load:

```typescript
const validatedConfig = agentConfigSchema.parse(luPlannerConfig);

export class LuPlannerAgent extends BaseAgentImpl {
  constructor() {
    super(validatedConfig);
  }
}
```

Note: The `src/agents/general/lu-planner.agent.ts` does NOT validate (older pattern). The luca-specific agents are the canonical pattern.

### Cognition + Context Config

The PM planner agent should use (from 18-CONTEXT.md Decision 10):

```typescript
cognition: {
  default_tier: "T2",
  promotable_to: "T2",
  memory_tags: ["planner", "estimation", "workflow", "complexity"],
},
context: {
  default_tier: "T1",
  promotable_to: "T2",
  isolation: "none",
},
```

### Agent Section Structure

Sections are ordered by the `order` field. Common section titles from existing agents:

- `role` (order: 1) -- Agent purpose and cognition integration
- `cognitive_pre_flight` (order: 2) -- Memory loading instructions
- `planning_methodology` / `execution_flow` (order: 3+) -- Domain-specific instructions
- `quality_guidelines` (order: 7) -- Quality standards

The PM planner agent will need sections for:

- `role` -- PM planner purpose, read-only constraint, cognition tier
- `cognitive_pre_flight` -- Load BRAIN.md priorities, recall estimation patterns from MEMORY.md
- `scoring_methodology` -- WSJF formula, inference rules for BV/TC/RR
- `scheduling_strategy` -- Big Rock First + WSJF tail, zone assignment
- `output_format` -- Session plan Markdown template with Mermaid gantt
- `weekly_planning` -- Weekly distribution logic (60/25/10/5)
- `read_only_constraint` -- Explicit output-only rules, ResultEnvelope format

### Build Pipeline Integration

From `scripts/build-all.ts`, there are two paths:

**Path 1: Registry agents** (preferred for new general-purpose agents)

```typescript
// src/agents/index.ts
export const agentRegistry = {
  "lu-pm-planner": LuPmPlannerAgent, // Add here
  // ...
};
```

Build loop auto-discovers and compiles them.

**Path 2: Luca-specific agents** (for agents tightly coupled to Luca workflow)

```typescript
// In build-all.ts, manually instantiated
const luPmPlanner = new LuPmPlannerAgent();
await Bun.write(path.join(cursorAgentsDir, 'lu-pm-planner.md'), ...);
await Bun.write(path.join(claudeAgentsDir, 'lu-pm-planner.md'), ...);
```

**Recommendation:** Use Path 1 (registry) since the PM planner is a general-purpose agent that could be used independently.

---

## 3. Todo File Inventory

### Pending Todo Files (13 total)

All files located in `.planning/todos/pending/`:

| File                                            | Title                                  | Area         | Created    | Source         |
| ----------------------------------------------- | -------------------------------------- | ------------ | ---------- | -------------- |
| `usage-aware-sprint-planner.md`                 | Usage-aware sprint planner             | workflow     | 2026-02-11 | conversation   |
| `checkpoint-and-rollback-system.md`             | Checkpoint and rollback system         | workflow     | 2026-02-10 | research       |
| `claude-code-plugin-packaging.md`               | Package Luca as Claude Code plugin     | distribution | 2026-02-10 | research       |
| `cognition-features-per-agent-audit.md`         | Audit cognition features per agent     | workflow     | 2026-02-10 | conversation   |
| `context-modularity-subagent-architecture.md`   | Context-modular sub-agent architecture | workflow     | 2026-02-10 | conversation   |
| `execution-verification-effectiveness-audit.md` | Audit execution/verification phases    | workflow     | 2026-02-10 | conversation   |
| `procedural-memory-learned-skills.md`           | Procedural memory (learned skills)     | workflow     | 2026-02-10 | research       |
| `progressive-context-disclosure.md`             | Progressive context disclosure         | workflow     | 2026-02-10 | research       |
| `ralph-wiggum-iterative-agent-loops.md`         | Ralph Wiggum iterative agent loops     | workflow     | 2026-02-10 | conversation   |
| `skill-naming-scope-oriented-convention.md`     | Rename skills to scope-oriented naming | workflow     | 2026-02-11 | conversation   |
| `tdd-first-verification-pattern.md`             | TDD-first verification pattern         | workflow     | 2026-02-10 | codebase-audit |
| `workflow-mind-map-mermaid.md`                  | Mermaid workflow mind map              | docs         | 2026-02-10 | conversation   |
| `writer-reviewer-separation.md`                 | Writer/reviewer context separation     | workflow     | 2026-02-10 | research       |

### YAML Frontmatter Fields

All pending todos use this consistent YAML frontmatter format:

```yaml
---
title: <descriptive title>
area: <workflow|distribution|docs>
created: <YYYY-MM-DD>
source: <conversation|research|research (<detail>)|codebase-audit + research>
---
```

**Available fields:**

- `title` (string, required) -- Descriptive title of the todo
- `area` (string, required) -- Domain area: `workflow`, `distribution`, `docs`
- `created` (date string, required) -- ISO date of creation
- `source` (string, required) -- Origin: `conversation`, `research`, `research (topic)`, `codebase-audit + research`

**Missing fields (not currently used but relevant for planner):**

- No `priority` field -- must be inferred by PM agent
- No `complexity` field -- must be inferred by PM agent
- No `dependencies` field -- must be inferred from `## Notes` cross-references
- No `estimated_effort` field -- must be inferred from content

### Content Structure

Each todo file follows this body structure:

```markdown
## Context

<Background and motivation>

## Task

<Numbered list of concrete tasks>

## Notes (optional)

<Cross-references, design considerations, related todos>
```

Some also have:

- `## Usage Cap Reference` (usage-aware-sprint-planner.md)
- `## Design Considerations` (usage-aware-sprint-planner.md)

### Cross-Reference Patterns

Todos reference each other in `## Notes` sections:

- "Related to: progressive-context-disclosure.md, context-modularity-subagent-architecture.md"
- "This pairs with the Ralph Wiggum iterative loop pattern"
- "Connects to the context modularity todo"

These cross-references are the planner's dependency signal.

---

## 4. Integration Points

### 4a. ResultEnvelope (`src/context/result-envelope.ts`)

The PM agent's output must conform to `ResultEnvelope`:

```typescript
export const resultEnvelopeSchema = z.object({
  status: resultStatusSchema, // "success" | "partial" | "failed" | "timeout"
  summary: z.string(), // Human-readable summary
  artifacts: z.array(resultArtifactSchema).default([]), // Files created/modified/deleted
  issues: z.array(resultIssueSchema).default([]), // Issues found
  metadata: resultMetadataSchema, // Agent name, duration, context tier
});
```

The PM agent will return its session plan as the `summary` field, and the plan file path as an artifact with action `"created"`. The orchestrator writes the file.

**Key integration**: `parseResultEnvelope()` provides fallback handling -- if the PM agent returns raw Markdown instead of JSON, it gets wrapped in a `status: "partial"` envelope automatically.

### 4b. ComplexityLevel (`src/complexity/`)

Effort estimation maps directly to `ComplexityLevel`:

```typescript
export const COMPLEXITY_LEVELS = [
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
] as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];
```

The planner needs a mapping from ComplexityLevel to effort points. This should go in `src/planner/defaults.ts`:

```typescript
export const EFFORT_POINTS: Record<ComplexityLevel, number> = {
  TRIVIAL: 1,
  SIMPLE: 2,
  MODERATE: 3,
  COMPLEX: 5,
  CRITICAL: 8,
};

export const CONTEXT_PERCENT_ESTIMATE: Record<ComplexityLevel, number> = {
  TRIVIAL: 5,
  SIMPLE: 10,
  MODERATE: 20,
  COMPLEX: 35,
  CRITICAL: 50,
};
```

The `COMPLEXITY_CLASSIFICATIONS` record in `src/complexity/defaults.ts` also provides `estimatedTime` strings that could inform duration estimates.

### 4c. ContextConfig (`src/context/types.ts`)

The PM agent's context assembly uses:

```typescript
export const contextConfigSchema = z.object({
  default_tier: contextTierSchema.default("T0"),
  promotable_to: contextTierSchema.default("T0"),
  isolation: isolationModeSchema.default("none"),
});
```

And the document set at T1 includes: `plan_content`, `brain_summary`.
At T2: adds `state_content`, `memory_entries`, `working_content`.

### 4d. config.json Integration

Current `config.json` has these top-level sections:

- `mode`, `depth`, `model_profile` (global settings)
- `cognitive` (cognition system settings)
- `workflow` (workflow step toggles)
- `planning` (planning settings)
- `parallelization` (parallel execution settings)
- `gates` (user confirmation gates)
- `safety` (safety confirmation flags)
- `harness` (verification harness config)
- `iteration` (iteration loop config -- from Phase 17)
- `complexity` (complexity gating matrix)

The new `planner` section should follow the same pattern as `iteration`:

```json
{
  "planner": {
    "session_cap_minutes": 180,
    "quality_zones": {
      "peak": { "start_pct": 0, "end_pct": 30 },
      "good": { "start_pct": 30, "end_pct": 50 },
      "degrading": { "start_pct": 50, "end_pct": 70 },
      "stop": { "start_pct": 70, "end_pct": 100 }
    },
    "weekly_allocation": {
      "needle_movers_pct": 60,
      "quick_wins_pct": 25,
      "maintenance_pct": 10,
      "reserve_pct": 5
    },
    "wsjf_scale_max": 5,
    "big_rock_min_complexity": "COMPLEX"
  }
}
```

This matches the iteration config pattern: flat object with sensible defaults, corresponding Zod schema in `types.ts`.

---

## 5. Recommendations

### 5a. Module Architecture

1. **Create `src/planner/` with the exact same structure as `src/iteration/`** -- types.ts, defaults.ts, scoring.ts, scheduler.ts, index.ts, plus co-located tests.

2. **`types.ts` should define these schemas:**
   - `wsjfInputsSchema` -- BV, TC, RR on 1-5 scale
   - `wsjfScoreSchema` -- Inputs + job_size + computed score
   - `qualityZoneSchema` -- "peak" | "good" | "degrading" | "stop"
   - `sessionSlotSchema` -- Todo reference + WSJF score + complexity + zone + rationale
   - `sessionPlanSchema` -- Date, budget, ordered slots, Mermaid gantt string, weekly context
   - `weeklyPlanSchema` -- Sessions array, allocation breakdown, cumulative progress
   - `plannerConfigSchema` -- Config section for config.json
   - `todoFrontmatterSchema` -- Parsed YAML frontmatter from todo files

3. **`defaults.ts` should define:**
   - `EFFORT_POINTS` mapping (ComplexityLevel -> number)
   - `CONTEXT_PERCENT_ESTIMATE` mapping (ComplexityLevel -> number)
   - `DEFAULT_QUALITY_ZONES` boundary definitions
   - `DEFAULT_WEEKLY_ALLOCATION` (60/25/10/5)
   - `DEFAULT_PLANNER_CONFIG` (full default config object)

4. **`scoring.ts` should provide:**
   - `computeWSJF(inputs, jobSize)` -- Pure WSJF calculation
   - `rankByWSJF(todos)` -- Sort an array of scored todos
   - CLI entry point for standalone WSJF scoring

5. **`scheduler.ts` should provide:**
   - `selectBigRock(todos)` -- Find highest-impact dependency-free COMPLEX+ todo
   - `scheduleSession(todos, config)` -- Full session scheduling algorithm
   - `assignQualityZones(slots, zoneConfig)` -- Zone assignment based on cumulative context %
   - `generateMermaidGantt(slots, sessionDate)` -- Mermaid gantt string generation
   - CLI entry point for standalone scheduling

### 5b. Agent Definition

1. **Create `src/agents/general/lu-pm-planner.agent.ts`** following the luca-specific pattern (with Zod validation at init).

2. **Register in `src/agents/index.ts`** as `'lu-pm-planner': LuPmPlannerAgent`.

3. **Agent sections should include:**
   - `role` (order 1): PM planner purpose, read-only constraint, cognition T2
   - `cognitive_pre_flight` (order 2): Load BRAIN.md priorities, recall estimation patterns
   - `backlog_analysis` (order 3): How to read and parse todo files
   - `scoring_methodology` (order 4): WSJF formula, inference rules
   - `scheduling_strategy` (order 5): Big Rock First + WSJF tail
   - `output_format` (order 6): Session plan Markdown + Mermaid gantt template
   - `weekly_planning` (order 7): Weekly distribution (60/25/10/5)
   - `read_only_constraint` (order 8): Output-only rules, no filesystem writes

4. **Cognition config:**

   ```typescript
   cognition: {
     default_tier: "T2",
     promotable_to: "T2",
     memory_tags: ["planner", "estimation", "workflow", "complexity"],
   }
   ```

5. **Context config:**

   ```typescript
   context: {
     default_tier: "T1",
     promotable_to: "T2",
     isolation: "none",
   }
   ```

6. **Tools:** `["Read", "Glob", "Grep"]` -- Read-only tools. No Write, Edit, or Bash.

### 5c. Build Pipeline

The agent will be auto-compiled by adding it to `agentRegistry` in `src/agents/index.ts`. No changes to `build-all.ts` needed.

### 5d. Config.json Extension

Add the `planner` section to `.planning/config.json` with defaults. Create corresponding `plannerConfigSchema` in `src/planner/types.ts`.

### 5e. Todo Parsing

Create a utility in `src/planner/` that:

1. Globs `.planning/todos/pending/*.md`
2. Parses YAML frontmatter (title, area, created, source)
3. Extracts `## Context`, `## Task`, `## Notes` sections
4. Extracts cross-references from Notes for dependency inference
5. Returns typed array of parsed todos

Consider using the `gray-matter` npm package for YAML frontmatter parsing, or implement a simple parser since the format is consistent.

---

## 6. Risk Assessment

### 6a. Low Risk

- **Module structure is well-established.** The `src/iteration/` pattern provides a clear blueprint. No architectural ambiguity.
- **Agent definition format is stable.** The AgentConfig/BaseAgentImpl pattern is used by 20+ agents. Well-tested compilation pipeline.
- **ResultEnvelope integration is straightforward.** The PM agent returns structured output; the orchestrator handles file writes.
- **Config.json extension is additive.** Adding a `planner` section has no impact on existing sections.

### 6b. Medium Risk

- **WSJF inference accuracy.** The PM agent must infer Business Value, Time Criticality, and Risk Reduction from unstructured todo descriptions. Initial accuracy will be low. Mitigation: MEMORY.md calibration loop will improve over time.
- **Context % estimation precision.** The effort-to-context-% mapping is a rough proxy. Different tasks within the same complexity level can vary significantly. Mitigation: v1 scope is relative ordering only (Decision 8), not absolute precision.
- **Todo cross-reference parsing.** Dependency inference from free-text `## Notes` sections is brittle. Mentions like "pairs with" and "related to" need NLP-level interpretation. Mitigation: The PM agent (LLM) does the inference, not regex parsing. The scoring module just provides the calculation framework.
- **Existing lu-planner naming conflict.** There is already an `lu-planner` agent (plan creator). The PM planner must have a distinct name (`lu-pm-planner`) to avoid confusion. Both exist in the general registry.

### 6c. High Risk

- **Read-only enforcement is advisory.** The agent definition says "read-only" and the tools list restricts to Read/Glob/Grep, but Claude Code agents can technically request any tool. Enforcement is at the prompt level, not runtime level. Mitigation: The tools array in frontmatter restricts the compiled agent definition. Claude Code respects tool restrictions in agent definitions.
- **Weekly planner session distribution complexity.** Distributing todos across multiple sessions within a weekly cap requires tracking cumulative progress across sessions. This state must persist somewhere (likely WORKING.md or a new `.planning/planner/` directory). This is more complex than the session planner and may need careful design. Mitigation: Start with session planner (PLAN-01 through PLAN-04), add weekly planner (PLAN-05) as a follow-on plan.

### 6d. Dependencies on Unrealized Features

- **Technical review gate (Decision 12)** requires the code-architect agent to review a session plan. This is a novel use of code-architect (reviewing a plan, not code). May need additional agent instructions.
- **MEMORY.md calibration (Decision 8)** requires lu-learner to extract estimation patterns tagged `[planner, estimation]`. lu-learner currently extracts from WORKING.md after execution. The calibration loop is a post-execution concern, not a Phase 18 implementation concern.

---

## 7. Implementation Order Recommendation

Based on dependency analysis and risk assessment:

### Plan 18-01: Foundation (types.ts + defaults.ts + plannerConfigSchema)

- All Zod schemas
- All default mappings (effort points, zones, weekly allocation)
- Config schema + config.json extension
- ~15 tests

### Plan 18-02: WSJF Scoring (scoring.ts)

- `computeWSJF`, `rankByWSJF`
- CLI entry point
- ~10 tests

### Plan 18-03: Session Scheduler (scheduler.ts)

- `selectBigRock`, `scheduleSession`, `assignQualityZones`, `generateMermaidGantt`
- CLI entry point
- ~15 tests

### Plan 18-04: PM Agent Definition (lu-pm-planner.agent.ts)

- Agent config with all sections
- Registration in agent registry
- Build verification

### Plan 18-05: Weekly Planner Extension

- Weekly plan types and scheduling
- Session distribution logic
- ~10 tests

### Plan 18-06: Integration + Token Cost Model

- Todo file parsing utility
- MEMORY.md calibration tag conventions
- Technical review gate (code-architect integration)
- End-to-end test

### Plan 18-07: Verification

- Full harness run (test + typecheck + build)
- Agent compilation verification
- Manual session plan generation test

---

_Research completed: 2026-02-11_
