# Systematization Gaps

Gaps between the current Luca architecture and a fully config-driven workflow system.

## Summary

The Luca framework is **~90% hardcoded, ~10% config-driven** for workflow structure. Behavioral configuration (gates, harness, complexity matrix, planner budgets) is well-externalized in `.planning/config.json`. But the core workflow topology — stages, agents, skills, edges, transitions — is hardcoded across multiple TypeScript files with no shared source of truth.

## The Five Key Gaps

### Gap 1: No Workflow Source of Truth

**Current state:** The pipeline topology exists in three disconnected places:

| Location                                          | What it defines                           | Format                     |
| ------------------------------------------------- | ----------------------------------------- | -------------------------- |
| `packages/luca-observer/lib/workflow-topology.ts` | Visual topology (34 nodes, 6 stages)      | Hardcoded TypeScript array |
| `src/skills/luca/lu.skill.ts`                     | Pipeline order (discuss → plan → execute) | Prose in skill body text   |
| `packages/luca-framework/src/state/machine.ts`    | State transitions (14 states, 23 events)  | XState machine definition  |

None of these reference each other. Adding or removing an agent requires editing all three independently.

**What's needed:** A single `workflow.json` (or equivalent) that defines stages, agents, skills, edges, and transitions — consumed by both the observer and the framework.

### Gap 2: No Agent-to-Stage Mapping in Framework

**Current state:** Agent definitions (`src/agents/**/*.agent.ts`) do not declare which pipeline stage they belong to. The `AgentFrontmatterSchema` has:

```typescript
// What exists:
(name, description, tools, cognition, context, purpose, allowed_contexts);

// What's missing:
stage; // "classify" | "discuss" | "plan" | "execute" | "verify" | "learn"
routing_preset; // "ALWAYS_FAST" | "ORCHESTRATOR" | "DEEP_ANALYSIS" | ...
```

Stage assignment exists only in `workflow-topology.ts` (observer) and `MODEL_ROUTING_TABLE` (complexity module) — two separate hardcoded mappings.

**Impact:** Adding a new agent requires editing 3-4 separate files:

1. Create `src/agents/general/{name}.agent.ts`
2. Add import + entry to `src/agents/__helpers/build-agent-registry.ts`
3. Add entry to `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts`
4. Add entry to `AGENTS[]` in `packages/luca-observer/lib/workflow-topology.ts`

### Gap 3: Skill-to-Agent Invocations Are Unstructured

**Current state:** Skills reference agents by name in their body text (prose), not in structured fields:

```typescript
// From lu.skill.ts — agent invocation is prose, not data:
content: `Task(agent: "lu-cognition", prompt: "...")
           Skill(skill: "phase-discuss", args: "{phase_number}")
           Skill(skill: "phase-plan", args: "{phase_number}")`;
```

```typescript
// From phase-discuss.skill.ts — agent reference is embedded in markdown:
content: `Spawn \`lu-discuss-researcher\` agent per gray area question`;
```

The `SkillFrontmatterSchema` has only:

```typescript
{ name: string, description: string, "disable-model-invocation"?: boolean }
```

No fields for: dependencies, invoked agents, invoked sub-skills, stage, prerequisites, or argument schemas.

**Impact:** It is impossible to programmatically determine:

- Which agents a skill invokes
- What order skills run in
- What the prerequisite chain is
- How to generate the correct `Skill()` / `Task()` calls from config

### Gap 4: Model Routing Is a Separate Data Structure

**Current state:** The `MODEL_ROUTING_TABLE` in `src/complexity/__helpers/model-routing.ts` is the single source of truth for agent model tiers. It maps 34 agents to 7 routing presets.

```typescript
export const MODEL_ROUTING_TABLE = {
  "lu-cognition": ALWAYS_FAST,
  "lu-executor": ORCHESTRATOR,
  "lu-verifier": DEEP_ANALYSIS,
  // ... 31 more
};
```

This is completely separate from:

- Agent definitions (which have deprecated `model_routing` / `model_tier` fields)
- The observer topology (which has a `model_tier` field per agent, manually set)

**Impact:** Model routing information exists in 3 places with different staleness levels. The observer shows "fast" / "balanced" / "capable" per agent, but this is hardcoded in the topology, not read from the routing table.

### Gap 5: No Bi-Directional Sync Between Observer and Framework

**Current state:** The observer is a Next.js app in `packages/luca-observer/`. The framework source is in `src/`. They share no code, no config, no types.

| Observer                                        | Framework                                                   |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `lib/workflow-topology.ts` (hardcoded topology) | `src/agents/` (agent definitions)                           |
| `lib/workflow-types.ts` (Zod schemas)           | `src/agents/__schemas/agent.schemas.ts` (different schemas) |
| `lib/constants.ts` (complexity levels)          | `src/complexity/` (routing table)                           |
| Reads from API route                            | No API — compiles to markdown                               |

**Impact:**

- Observer cannot discover new agents automatically
- Framework changes don't propagate to the visual editor
- Editor cannot output config changes back to the framework
- No "edit node → update agent file" workflow is possible

## What `.planning/config.json` Already Covers

The behavioral layer is well-externalized:

| Section             | Keys                                                         | Purpose              |
| ------------------- | ------------------------------------------------------------ | -------------------- |
| `workflow`          | research, plan_check, verifier, code_review, uat_required    | Feature toggles      |
| `harness`           | enabled, maxFixIterations, failFast, checks[]                | Verification config  |
| `complexity.matrix` | TRIVIAL → CRITICAL with step activation, loop budgets        | Complexity gating    |
| `gates`             | confirm_project, confirm_plan, confirm_phases, etc.          | Human approval gates |
| `autopilot`         | oversight, max_phases_per_session, auto_plan_phases          | Autonomous mode      |
| `planner`           | session_cap_minutes, weekly_allocation, zone_boundaries      | Sprint planning      |
| `parallelization`   | enabled, plan_level, task_level, max_concurrent_agents       | Concurrency          |
| `safety`            | always_confirm_destructive, always_confirm_external_services | Safety rails         |

**What's missing from config.json:**

| Missing                 | Current Location                         |
| ----------------------- | ---------------------------------------- |
| `workflow.stages`       | Hardcoded enum in TypeScript             |
| `workflow.agents`       | 34 agent files + manual registry         |
| `workflow.skills`       | 52 skill files + manual registry         |
| `workflow.topology`     | `AGENTS[]` array in workflow-topology.ts |
| `workflow.edges`        | Hardcoded in workflow-topology.ts        |
| `workflow.transitions`  | Implicit in skill body text              |
| `workflow.agent_routes` | Hardcoded in lu.skill.ts                 |

## Registration Is Manual and Multi-Step

### Current Agent Registration Flow

1. Create `src/agents/general/{name}.agent.ts` with `AgentConfig`
2. Edit `src/agents/__helpers/build-agent-registry.ts` — add import + registry entry
3. Edit `src/complexity/__helpers/model-routing.ts` — add to `MODEL_ROUTING_TABLE`
4. Edit `packages/luca-observer/lib/workflow-topology.ts` — add to `AGENTS[]`
5. Run `bun run build:all` to generate compiled output

**5 separate edits for 1 new agent.** No automated discovery. No file scanning.

### Current Skill Registration Flow

1. Create `src/skills/general/{name}.skill.ts` with `SkillConfig`
2. Edit `src/skills/__helpers/build-skill-registry.ts` — add import + registry entry
3. Manually update any parent skill's body text to add `Skill(skill: "new-skill")` calls
4. Run `bun run build:all`

**No structured invocation graph.** Skill-to-skill and skill-to-agent relationships are encoded in prose.

## Compiler Pipeline

The compiler reads from registries (not config) and generates markdown:

```
src/agents/*.agent.ts → agentRegistry → compile() → .claude/agents/*.md
src/skills/*.skill.ts → skillRegistry → compile() → .claude/skills/*.md
src/rules/*.rule.ts   → ruleRegistry  → compile() → .claude/rules/*.md
```

Supported output formats: CLAUDE, CURSOR, PLUGIN, PI.

**Gap:** Compilers consume registries. If topology were config-driven, compilers would need to read a workflow config to understand agent-skill-stage relationships and generate correctly-linked markdown (e.g., skill markdown that contains the right `Skill()` / `Task()` calls).

## Observer Topology Accuracy Issues

Per the [topology audit](topology-audit.md):

1. **19 agents missing** — only 20 of 38 agents appear in the topology
2. **51 skills absent** — zero skill nodes in the graph
3. **Complexity gating is wrong** — topology hides agents by complexity, but the actual workflow runs all agents at all levels (complexity only controls model tier)
4. **Edge gaps** — missing skill→agent invocation edges, missing fix loops

These accuracy issues exist because the topology is hardcoded and maintained independently of the framework source.

## Consequences

1. **No visual accuracy** — the workflow editor shows an incomplete, partially-wrong topology
2. **No editor functionality** — cannot edit nodes to create/modify agent or skill files
3. **No config output** — cannot export a workflow config that drives the framework
4. **No auto-discovery** — new agents/skills require manual registration in 3-5 places
5. **No runtime visualization** — cannot show which state the machine is in during execution
6. **Drift is inevitable** — any change to the framework requires parallel changes to the observer
