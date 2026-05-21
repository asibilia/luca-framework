# Plan 11-07: Frontmatter Override Removal & Single Source of Truth

## Frontmatter

- **ID**: 11-07
- **Title**: Frontmatter Override Removal & Single Source of Truth
- **Phase**: 11 (Hooks)
- **Wave**: 2 (after 05)
- **Depends on**: 11-05
- **Delivers**: Roadmap item "Extract MODEL_ROUTING_TABLE to named presets" (dual-source resolution)

## Objective

Resolve the dual-source-of-truth problem by removing the agent frontmatter `model_routing` override path from `resolveModel()` in `src/agents/__helpers/resolve-model.ts`, stripping `model_routing` from all 36 agent files, and making the routing table the single authoritative source for complexity-to-model mapping.

## Context

- `src/agents/__helpers/resolve-model.ts` -- The `resolveModel()` function with a 6-step priority chain where steps 1-2 (frontmatter overrides) beat step 3.5 (routing table), effectively making the table a dead letter for any agent that has frontmatter `model_routing`.
- `src/agents/__schemas/agent.schemas.ts` -- Defines `AgentFrontmatter` with `model_routing` and `model_tier` optional fields.
- `src/agents/general/*.agent.ts` and `src/agents/luca/*.agent.ts` -- 36 agent files with `model_routing` frontmatter that duplicates routing table entries.
- Plan 11-05 must be completed first (presets defined, table refactored).

## Tasks

### 1. Audit agent frontmatter and remove frontmatter override from resolveModel()

**Type:** auto
**TDD:** false
**Depends on:** None (Plan 11-05 complete)

Two actions in one task:

**A. Audit:** Scan all agent files in `src/agents/general/` and `src/agents/luca/` that define `model_routing` in frontmatter. For each, confirm the frontmatter routing matches the preset assigned in `MODEL_ROUTING_TABLE`. Log any divergences as comments in the commit message.

**B. Simplify resolveModel():** Remove the frontmatter override steps from the priority chain:

**Before (6 steps):**

1. Agent's `complexity_overrides[level]` (frontmatter)
2. Agent's `model_routing.default_model` (frontmatter)
3. Agent's `model_tier` mapped to ModelId (frontmatter)
   3.5. Routing table lookup via `resolveModelForAgent`
4. Agent's `purpose` mapped via `ROLE_MODEL_DEFAULTS`
5. Complexity gate's `default_model`
6. `"sonnet"` fallback

**After (4 steps):**

1. Routing table lookup via `resolveModelForAgent` (now primary)
2. Agent's `purpose` mapped via `ROLE_MODEL_DEFAULTS`
3. Complexity gate's `default_model`
4. `"sonnet"` fallback

Update all three functions: `resolveModel()`, `resolveModelWithZone()`, and `resolveModelWithDecision()`.

Update the `ModelRoutingDecision.source` type to remove `"complexity_override"`, `"agent_default"`, and `"model_tier"` source options.

**Files to edit:**

- `src/agents/__helpers/resolve-model.ts`

**Verification:**

- `resolveModel()` no longer reads `agentFrontmatter.model_routing` or `agentFrontmatter.model_tier`
- `resolveModelWithDecision()` no longer has `"complexity_override"`, `"agent_default"`, or `"model_tier"` branches
- `bunx --bun tsc --noEmit` passes
- `grep -rn 'model_routing\|model_tier' src/agents/__helpers/resolve-model.ts` returns 0 meaningful references (only comments allowed)

### 2. Strip model_routing from agent frontmatter and deprecate schema field

**Type:** auto
**TDD:** false
**Depends on:** 1

Remove the `model_routing` field from all 36 agent frontmatter definitions. Also remove `model_tier` where present.

Update `AgentFrontmatter` schema in `src/agents/__schemas/agent.schemas.ts`:

- Keep `model_routing` and `model_tier` as optional fields (backward compatibility with external plugins)
- Add `@deprecated` JSDoc comment explaining the routing table is authoritative

**Files to edit:**

- All 36 agent files in `src/agents/general/` and `src/agents/luca/` that have `model_routing`
- `src/agents/__schemas/agent.schemas.ts` (add deprecation comment)

**Verification:**

- `grep -rn 'model_routing: {' src/agents/` returns 0 results (only schema definition remains)
- `bunx --bun tsc --noEmit` passes
- Agent compilation still works (the field was optional, removing it should not break anything)

### 3. Update complexity-gating rule for single source of truth

**Type:** auto
**TDD:** false
**Depends on:** 1

Update `src/rules/general/complexity-gating.rule.ts` to:

- Remove all mention of frontmatter `model_routing` overrides
- Document that MODEL_ROUTING_TABLE is the **single** source of truth
- Update override mechanisms section to remove frontmatter-based overrides

**Files to edit:**

- `src/rules/general/complexity-gating.rule.ts`

**Verification:**

- No mention of frontmatter `model_routing` overrides in rule content
- Rule explicitly states routing table is single source of truth
- `bunx --bun tsc --noEmit` passes

## Verification

1. `resolveModel()` priority chain simplified to 4 steps (routing table is primary)
2. No agent files contain `model_routing: {` in their frontmatter
3. All agents resolve to the same models as before (behavioral equivalence)
4. `bunx --bun tsc --noEmit` passes
5. Complexity-gating rule documents single source of truth

## Success Criteria

- Single source of truth established: routing table is authoritative, no frontmatter overrides
- resolveModel() simplified from 6-step to 4-step priority chain
- Zero behavioral change in model selection for any agent at any complexity level
- 36 agent files cleaned of redundant model_routing frontmatter

## Output Specification

- `src/agents/__helpers/resolve-model.ts` (simplified priority chain)
- `src/agents/__schemas/agent.schemas.ts` (deprecation comment on model_routing)
- 36 agent files (model_routing removed from frontmatter)
- `src/rules/general/complexity-gating.rule.ts` (single source of truth documented)
