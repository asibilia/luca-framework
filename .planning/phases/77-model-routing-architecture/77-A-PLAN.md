# Plan 77-A — Model Tier & Per-Agent Routing

## Objective

Add `model_tier` field to all agent definitions, providing a high-level categorization ("fast" | "balanced" | "capable") that maps to concrete model IDs. This replaces the need for the complexity gating skip/run matrix to control agent behavior — agents declare their compute needs, and the resolution chain handles the rest.

## Context

- `ModelRoutingConfigSchema` already exists with `default_model` and `complexity_overrides`
- `resolveModel()` already has a 4-step priority chain
- 5/29 agents already have `model_routing` configured
- Phase 77 adds `model_tier` as a simpler, universal categorization for all agents

## Tasks

### T1 — Add ModelTierSchema to complexity domain

**File:** `src/complexity/__schemas/complexity.schemas.ts`

- Add `ModelTierSchema = z.enum(["fast", "balanced", "capable"])`
- Add `MODEL_TIER_TO_MODEL` map: fast→haiku, balanced→sonnet, capable→opus
- Export both

**Verify:** `bunx --bun tsc --noEmit`

### T2 — Add model_tier to AgentFrontmatterSchema

**File:** `src/agents/__schemas/agent.schemas.ts`

- Import `ModelTierSchema` from complexity
- Add `model_tier: ModelTierSchema.optional()` to `AgentFrontmatterSchema`

**Verify:** `bunx --bun tsc --noEmit`

### T3 — Update resolveModel priority chain

**File:** `src/agents/__helpers/resolve-model.ts`

- Import `MODEL_TIER_TO_MODEL` and `ModelTier` from complexity
- Insert step 2.5: if `agentFrontmatter.model_tier` is set, map to ModelId via `MODEL_TIER_TO_MODEL`
- Update JSDoc priority chain documentation

Updated chain:

1. Agent complexity_overrides[level] (most specific)
2. Agent model_routing.default_model (agent preference)
3. Agent model_tier → mapped to ModelId (tier default)
4. Complexity gate default_model (system-level)
5. "sonnet" (universal fallback)

**Verify:** `bunx --bun tsc --noEmit`

### T4 — Assign model_tier to all 29 agents

Assign based on agent purpose:

**fast** (lightweight, classification, routing):

- lu-router, lu-cognition

**balanced** (standard execution, planning, verification):

- lu-executor, lu-planner, lu-verifier, lu-test-writer, lu-learner, lu-plan-checker, lu-pm-planner, lu-pr-reviewer, lu-phase-researcher, lu-discuss-researcher, lu-project-researcher, lu-research-synthesizer, lu-integration-checker, lu-codebase-mapper, lu-roadmapper, lu-debugger, lu-repo-architect, qa-plan-generator, product

**capable** (deep analysis, architecture, security):

- code-architect, code-simplifier, dx-advocate, code-developer, performance-auditor, security-auditor, ui, ux

**Verify:** `bunx --bun tsc --noEmit`

### T5 — Mark complexity step gating as deprecated

**File:** `src/complexity/__schemas/complexity.schemas.ts`

- Add `@deprecated` JSDoc to StepActivation fields in ComplexityGateSchema
- Note: "Workflow step gating is superseded by per-agent model routing. Steps now always run; agents route to appropriate models based on complexity."

### T6 — Tests

- Add `model-tier.test.ts` in `__tests__/src/agents/__helpers/`
- Test resolveModel with model_tier in the priority chain
- Test MODEL_TIER_TO_MODEL mapping
- Verify existing resolveModel tests still pass

**Verify:** `bun test`

## Success Criteria

- [ ] All 29 agents have `model_tier` field
- [ ] `resolveModel()` uses model_tier in priority chain
- [ ] `MODEL_TIER_TO_MODEL` mapping exists and is exported
- [ ] Existing tests pass
- [ ] New model_tier resolution tests pass
- [ ] `bunx --bun tsc --noEmit` clean
