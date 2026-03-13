# Target Architecture

Proposed architecture for a unified, config-driven workflow system where the observer, framework, and compilers share a single source of truth.

## Design Goals

1. **Single source of truth** — one workflow config defines all stages, agents, skills, edges, and transitions
2. **Observer reads from config** — topology is generated from config, not hardcoded
3. **Editor writes to config** — node edits produce config changes that propagate to the framework
4. **Compiler reads from config** — generated markdown files include correct `Skill()` / `Task()` calls
5. **Auto-discovery** — new agents/skills are registered by adding to config (or auto-scanned)
6. **Model routing unified** — routing presets are part of agent definitions, not a separate table

## Proposed Config Structure

### `workflow.json` (or `workflow-config.ts`)

A new top-level config that defines the complete workflow topology:

```typescript
// workflow-config.schema.ts
const WorkflowConfigSchema = z.object({
  /** Pipeline stage definitions (ordered) */
  stages: z.array(
    z.object({
      id: z.string(), // "classify", "discuss", etc.
      label: z.string(), // "Classify"
      description: z.string(),
      order: z.number(), // display/execution order
    }),
  ),

  /** Agent definitions with stage assignment */
  agents: z.array(
    z.object({
      id: z.string(), // "lu-cognition"
      stage: z.string(), // "classify" — which stage this agent belongs to
      routing_preset: z.string(), // "ALWAYS_FAST" — model routing preset name
      purpose: z.string(), // "pre-flight", "reviewer", "executor"
      description: z.string(),
      spawns: z.array(z.string()).default([]), // agent IDs this agent spawns
    }),
  ),

  /** Skill definitions with structured invocations */
  skills: z.array(
    z.object({
      id: z.string(), // "phase-discuss"
      stage: z.string().optional(), // "discuss" — stage this skill orchestrates
      description: z.string(),
      invokes_agents: z
        .array(
          z.object({
            agent_id: z.string(),
            condition: z.string().optional(), // "complexity >= MODERATE"
            order: z.number().optional(),
          }),
        )
        .default([]),
      invokes_skills: z
        .array(
          z.object({
            skill_id: z.string(),
            condition: z.string().optional(),
            order: z.number().optional(),
          }),
        )
        .default([]),
    }),
  ),

  /** Pipeline transitions (stage-to-stage flow) */
  transitions: z.array(
    z.object({
      from_stage: z.string(),
      to_stage: z.string(),
      edge_type: z.enum(["data-flow", "spawns", "gates"]).default("data-flow"),
      condition: z.string().optional(),
      always_run: z.boolean().default(true),
    }),
  ),

  /** Entry point routing (task type → skill) */
  entry_routes: z.array(
    z.object({
      task_type: z.string(), // "phase-work", "new-project", "pr-review", "debug", "quick"
      target_skill: z.string(), // "phase-discuss" or "autopilot"
      description: z.string(),
    }),
  ),
});
```

### Example Config

```json
{
  "stages": [
    {
      "id": "classify",
      "label": "Classify",
      "description": "Task classification and complexity routing",
      "order": 0
    },
    {
      "id": "discuss",
      "label": "Discuss",
      "description": "Gather context and identify gray areas",
      "order": 1
    },
    {
      "id": "plan",
      "label": "Plan",
      "description": "Create execution plan with verification criteria",
      "order": 2
    },
    {
      "id": "execute",
      "label": "Execute",
      "description": "Wave-based plan execution with harness checks",
      "order": 3
    },
    {
      "id": "verify",
      "label": "Verify",
      "description": "Comprehensive verification and code review",
      "order": 4
    },
    {
      "id": "learn",
      "label": "Learn",
      "description": "Pattern capture and process data collection",
      "order": 5
    }
  ],
  "agents": [
    {
      "id": "lu-cognition",
      "stage": "classify",
      "routing_preset": "ALWAYS_FAST",
      "purpose": "pre-flight",
      "description": "Cognitive pre-flight: load project identity, recall patterns",
      "spawns": []
    },
    {
      "id": "lu-router",
      "stage": "classify",
      "routing_preset": "ROUTER",
      "purpose": "classifier",
      "description": "Classify task complexity",
      "spawns": ["lu-router-fast"]
    },
    {
      "id": "lu-executor",
      "stage": "execute",
      "routing_preset": "ORCHESTRATOR",
      "purpose": "executor",
      "description": "Execute plan waves with atomic commits",
      "spawns": ["lu-test-writer"]
    },
    {
      "id": "lu-verifier",
      "stage": "verify",
      "routing_preset": "DEEP_ANALYSIS",
      "purpose": "verifier",
      "description": "Goal-backward verification of phase achievement",
      "spawns": []
    }
  ],
  "skills": [
    {
      "id": "phase-discuss",
      "stage": "discuss",
      "description": "Orchestrate discussion phase",
      "invokes_agents": [
        {
          "agent_id": "lu-discuss-researcher",
          "condition": "per gray area question"
        }
      ],
      "invokes_skills": []
    },
    {
      "id": "phase-plan",
      "stage": "plan",
      "description": "Orchestrate planning phase",
      "invokes_agents": [
        { "agent_id": "lu-phase-researcher" },
        { "agent_id": "lu-planner" },
        { "agent_id": "lu-plan-checker" }
      ],
      "invokes_skills": []
    }
  ],
  "transitions": [
    { "from_stage": "classify", "to_stage": "discuss", "always_run": true },
    { "from_stage": "discuss", "to_stage": "plan", "always_run": true },
    { "from_stage": "plan", "to_stage": "execute", "always_run": true },
    { "from_stage": "execute", "to_stage": "verify", "always_run": true },
    { "from_stage": "verify", "to_stage": "learn", "always_run": true },
    {
      "from_stage": "learn",
      "to_stage": "classify",
      "edge_type": "data-flow",
      "condition": "has_more_phases"
    }
  ],
  "entry_routes": [
    {
      "task_type": "phase-work",
      "target_skill": "phase-discuss",
      "description": "Phase-based development"
    },
    {
      "task_type": "new-project",
      "target_skill": "project-new",
      "description": "New project initialization"
    },
    {
      "task_type": "quick",
      "target_skill": "quick",
      "description": "Ad-hoc quick task"
    },
    {
      "task_type": "debug",
      "target_skill": "debug",
      "description": "Debug workflow"
    },
    {
      "task_type": "pr-review",
      "target_skill": "pr-address",
      "description": "PR comment review"
    }
  ]
}
```

## Data Flow

### Current (Disconnected)

```
src/agents/*.agent.ts  ─→ agentRegistry ─→ compilers ─→ .claude/agents/*.md
                                                          (no topology info)

workflow-topology.ts   ─→ API route ─→ observer
(hardcoded, separate)

lu.skill.ts body text  ─→ (prose, not parseable)
(pipeline order)
```

### Proposed (Unified)

```
workflow.json (single source of truth)
    │
    ├──→ Observer: getTopology() reads config → generates React Flow nodes/edges
    │
    ├──→ Compilers: read config → generate .claude/agents/*.md with correct Skill()/Task() calls
    │
    ├──→ Registries: auto-generated from config (or config references existing .agent.ts files)
    │
    └──→ State Machine: reads stage definitions for state mapping
```

## Consumer Changes

### Observer (`packages/luca-observer`)

**`lib/workflow-topology.ts`** — Replace hardcoded `AGENTS[]` with config reader:

```typescript
// Before: hardcoded array
const AGENTS: AgentDef[] = [
  { id: "lu-cognition", stage: "classify", ... },
  // 33 more...
];

// After: read from shared config
import { loadWorkflowConfig } from "~/lib/workflow-config";

export function getTopology(): WorkflowTopologyResponse {
  const config = loadWorkflowConfig();
  // Generate nodes from config.agents, config.skills
  // Generate edges from config.transitions, agent.spawns, skill.invokes_agents
  // Compute container sizes from child counts
}
```

**`lib/workflow-config.ts`** — New module to load and validate config:

```typescript
import { WorkflowConfigSchema } from "shared/workflow-config.schema";

export function loadWorkflowConfig() {
  // Option A: Read from filesystem (for development)
  // Option B: Read from API (for production)
  // Option C: Import from shared package
  const raw = readConfigFile();
  return WorkflowConfigSchema.parse(raw);
}
```

### Complexity Filter

Replace agent-hiding behavior with model tier visualization:

```typescript
// Before: hide agents where complexity_min > selected level
// After: show model tier badges that change based on selected complexity

function getModelTierForAgent(agentId: string, complexity: string): ModelTier {
  const config = loadWorkflowConfig();
  const agent = config.agents.find((a) => a.id === agentId);
  const preset = ROUTING_PRESETS[agent.routing_preset];
  return preset[complexity]; // "fast" | "balanced" | "capable"
}
```

### Compilers (`src/compilers`)

Read workflow config to generate skill markdown with correct invocation calls:

```typescript
// Before: compile skill body text as-is (contains hardcoded Skill()/Task() calls)
// After: generate invocation section from config

function compileSkillWithInvocations(
  skill: BaseSkill,
  config: WorkflowConfig,
): string {
  const skillConfig = config.skills.find((s) => s.id === skill.name);
  if (!skillConfig) return compileSkillDefault(skill);

  // Generate structured invocation block
  const invocations = skillConfig.invokes_agents
    .map((inv) => `Task(agent: "${inv.agent_id}", prompt: "...")`)
    .join("\n");

  return `${skill.compiledBody}\n\n## Invocations\n\n${invocations}`;
}
```

### State Machine (`packages/luca-framework/src/state`)

Optionally read stage definitions from config for validation:

```typescript
// Validate that state transitions align with config stages
const config = loadWorkflowConfig();
const stageIds = config.stages.map((s) => s.id);
// Assert all machine states map to valid stages
```

## Migration Strategy

### Phase 1: Extract Config (Non-Breaking)

1. Create `workflow.json` from current hardcoded data
2. `getTopology()` reads from config instead of `AGENTS[]` array
3. Keep `AGENTS[]` as fallback during migration
4. Observer behavior is identical — just different data source

### Phase 2: Enrich Agent Schema

1. Add `stage` and `routing_preset` fields to `AgentFrontmatterSchema`
2. Populate from config (or directly in agent files)
3. Remove `MODEL_ROUTING_TABLE` as separate data structure
4. Model routing reads from agent definitions via config

### Phase 3: Structured Skill Invocations

1. Add `invokes_agents` and `invokes_skills` to `SkillFrontmatterSchema`
2. Compilers generate `Skill()` / `Task()` calls from structured data
3. Skill body text no longer needs hardcoded invocation references
4. Observer can show skill→agent edges from config data

### Phase 4: Editor Writes Config

1. Observer node edits produce config diffs
2. "Save" action writes updated `workflow.json`
3. A "generate" command creates/updates agent/skill files from config
4. Bi-directional: edit in code or edit in visual editor

### Phase 5: Auto-Discovery (Optional)

1. File scanner discovers `src/agents/**/*.agent.ts` files
2. Reads frontmatter to extract stage, routing_preset, etc.
3. Generates workflow.json from scanned data
4. Config becomes a derived artifact (or a merge of scanned + manual overrides)

## Design Decisions

### Where Does the Config Live?

**Option A: `src/workflow/workflow.json`** — Lives in framework source, compiled to output.

- Pro: Part of the source code, versioned, type-checked
- Con: Observer needs to import from framework package

**Option B: `.planning/workflow.json`** — Lives in planning directory.

- Pro: Easy to edit, alongside config.json
- Con: Not part of source code, could diverge

**Option C: Shared package** — New `packages/luca-workflow-config/` package.

- Pro: Both observer and framework import from same package
- Con: Another package to maintain

**Recommendation: Option A** with a shared Zod schema package. The config lives in `src/workflow/` and gets compiled alongside agents/skills/rules. The observer imports the compiled config.

### Schema Location

The `WorkflowConfigSchema` should live in a location importable by both the observer and the framework. Options:

1. **`src/workflow/__schemas/workflow-config.schemas.ts`** — New domain in framework
2. **Shared npm package** — Published as `@luca/workflow-config`
3. **Duplicated** — Copy schema to both observer and framework (not ideal)

**Recommendation: Option 1** initially, with the compiled schema available at `dist/workflow/`. The observer imports the schema from the framework's dist output during development.

### Config vs Code for Agent Definitions

The config does NOT replace agent `.ts` files — it supplements them with topology metadata. Agent files still define:

- Frontmatter (tools, cognition, context)
- Body sections (prompts, instructions)

The workflow config defines:

- Which stage the agent belongs to
- What routing preset it uses
- What it spawns
- How it connects to other nodes in the topology

## Schemas Required

| Schema                      | Purpose                               |
| --------------------------- | ------------------------------------- |
| `WorkflowConfigSchema`      | Top-level workflow structure          |
| `WorkflowStageConfigSchema` | Stage definition                      |
| `WorkflowAgentConfigSchema` | Agent topology entry                  |
| `WorkflowSkillConfigSchema` | Skill topology entry with invocations |
| `WorkflowTransitionSchema`  | Stage-to-stage transition             |
| `WorkflowEntryRouteSchema`  | Task type → skill routing             |
| `AgentInvocationSchema`     | Structured agent reference from skill |
| `SkillInvocationSchema`     | Structured skill reference from skill |

## Benefits

1. **Accuracy** — Observer always shows the real topology
2. **Completeness** — All 38 agents and 51 skills can be represented
3. **Editability** — Visual editor can modify the workflow
4. **Consistency** — One change propagates everywhere
5. **Discoverability** — `workflow.json` is the map of the entire system
6. **Correctness** — Complexity filter shows model tiers, not agent visibility
7. **Automation** — Adding an agent is 1 config edit + 1 file creation
