# Plan 59-B: Update lu-router and Key Agents

## Objective

Update lu-router to output model recommendations and add model routing preferences to key agents.

## Tasks

### 1. Update lu-router agent

Add model recommendation to lu-router's output format. In the role section, add instructions for the router to include `recommended_model` in its routing output based on:

- Agent's model_routing.default_model (if set)
- Complexity level's default_model from matrix
- Agent's complexity_overrides (if set)

### 2. Add model routing to key agents

Update these 5 agents with model_routing preferences:

- `lu-executor.agent.ts`: default_model "sonnet", CRITICAL→"opus"
- `lu-verifier.agent.ts`: default_model "sonnet", TRIVIAL→"haiku"
- `lu-planner.agent.ts`: default_model "sonnet", COMPLEX→"opus", CRITICAL→"opus"
- `lu-cognition.agent.ts`: default_model "haiku" (lightweight preflight)
- `lu-router.agent.ts`: default_model "haiku" (classification is lightweight)

### 3. Create resolve-model helper

In `src/agents/__helpers/resolve-model.ts`, create a function:

```typescript
export function resolveModel(
  agentConfig: AgentFrontmatter,
  complexityLevel: ComplexityLevel,
  complexityGate: ComplexityGate,
): ModelId;
```

Logic: Agent complexity_overrides > Agent default_model > Gate default_model > "sonnet"

## Verification

- TypeScript compiles
- All tests pass
- Build generates updated agent outputs
