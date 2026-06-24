# SUMMARY: Plan 11-07 -- Frontmatter Override Removal & Single Source of Truth

## Result: COMPLETE

**Phase:** 11 (Hooks)
**Wave:** 2
**Duration:** ~10 minutes
**Complexity:** TRIVIAL

## Objective

Resolve the dual-source-of-truth problem by removing agent frontmatter `model_routing` override path from `resolveModel()`, stripping `model_routing` from all 36 agent files, and making the routing table the single authoritative source for complexity-to-model mapping.

## Tasks Completed

### Task 1: Audit agent frontmatter and remove frontmatter override from resolveModel()

**Commit:** `1b97a5fb`

- Audited all 36 agent files -- confirmed every frontmatter `model_routing` value matches its routing table preset (zero divergences)
- Simplified `resolveModel()` from 6-step to 4-step priority chain:
  - Before: complexity_overrides -> agent_default -> model_tier -> routing_table -> role_default -> gate_default -> fallback
  - After: routing_table -> role_default -> gate_default -> fallback
- Updated `resolveModelWithZone()` and `resolveModelWithDecision()` signatures to remove `model_routing` and `model_tier` from the `Pick<>` type
- Removed `"complexity_override"`, `"agent_default"`, and `"model_tier"` from `ModelRoutingDecision.source` type
- Updated JSDoc in `model-routing.ts` to reflect single-source-of-truth status

### Task 2: Strip model_routing from agent frontmatter and deprecate schema field

**Commit:** `e802c5da`

- Removed `model_routing` and `model_tier` properties from all 36 agent frontmatter definitions:
  - 2 agents in `src/agents/luca/` (lu-executor, lu-planner)
  - 34 agents in `src/agents/general/`
- Added `@deprecated` JSDoc to `model_routing` and `model_tier` in `AgentFrontmatterSchema` (retained for backward compatibility with external plugins)
- Updated `buildPiAgentFrontmatter()` in `create-agent.ts` with deprecation comment

### Task 3: Update complexity-gating rule for single source of truth

**Commit:** `d629b71a`

- Replaced "Note: frontmatter overrides being removed in Plan 07" with explicit single-source-of-truth statement
- Rule now documents that `MODEL_ROUTING_TABLE` is authoritative, frontmatter fields are deprecated

## Verification

- [x] `resolveModel()` priority chain simplified to 4 steps (routing table is primary)
- [x] No agent files contain `model_routing: {` in their frontmatter
- [x] `bunx --bun tsc --noEmit` passes
- [x] Complexity-gating rule documents single source of truth
- [x] Zero behavioral change in model selection (all frontmatter values matched routing table)

## Deviations

- **[Rule 2 - Missing Critical]** Updated `create-agent.ts` `buildPiAgentFrontmatter()` with deprecation comment for the `model_routing` and `model_tier` reads. These are still functional for backward compatibility but annotated as deprecated.
- **[Rule 2 - Missing Critical]** Updated `resolveModelForAgent()` JSDoc in `model-routing.ts` to remove mention of frontmatter overrides taking precedence.

## Files Changed

- `src/agents/__helpers/resolve-model.ts` -- Simplified 4-step priority chain
- `src/agents/__helpers/create-agent.ts` -- Deprecation comment on Pi frontmatter builder
- `src/agents/__schemas/agent.schemas.ts` -- @deprecated JSDoc on model_routing, model_tier
- `src/complexity/__helpers/model-routing.ts` -- Updated JSDoc for single source of truth
- `src/rules/general/complexity-gating.rule.ts` -- Single source of truth documented
- 36 agent files (model_routing and model_tier removed from frontmatter)

## Net Effect

- **262 lines removed** from agent frontmatter (redundant model routing config)
- **41 lines removed** from resolve-model.ts (eliminated frontmatter override steps)
- Single source of truth established: `MODEL_ROUTING_TABLE` is authoritative
