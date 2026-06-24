---
phase: 260
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 260 Plan 1: Token Profiles

## Objective

Add a `--profile=budget|balanced|quality` CLI flag to `/lu` that lets users control ceremony depth without touching protected workflow steps. The `balanced` profile must match current behavior exactly (zero regression). `budget` demotes non-protected agents by one model tier and halves loop budgets. `quality` promotes all agents one tier and doubles loop budgets. The active profile is stored in `state.json` (the `token_profile` field already exists from Phase 258).

## Context

@src/complexity/**helpers/model-routing.ts
@src/complexity/**schemas/complexity.schemas.ts
@packages/luca-framework/src/state/types.ts
@src/skills/luca/lu.skill.ts

## Tasks

### 1. Token profile schema and tier modifier utilities

**Type:** auto
**TDD:** false
**Depends on:** (none)

Create `src/complexity/__helpers/token-profile.ts` as a new T0-compatible helper that lives alongside `model-routing.ts`. This file is the single source of truth for:

- `TOKEN_PROFILES` constant: `["budget", "balanced", "quality"]`
- `TokenProfile` type (inferred from the enum already in `workflowContextSchema` — import it from the state types or re-declare locally)
- `PROTECTED_AGENTS` constant: the frozen set of agent names that budget profile never demotes: `["lu-executor", "lu-discuss-researcher", "code-architect", "dx-advocate", "security-auditor", "code-simplifier", "lu-learner"]`
- `demoteTier(tier: ModelTier): ModelTier` — fast stays fast, balanced→fast, capable→balanced
- `promoteTier(tier: ModelTier): ModelTier` — capable stays capable, balanced→capable, fast→balanced
- `resolveModelWithProfile(agentName: string, complexity: ComplexityLevel, profile: TokenProfile): ModelTier` — wraps `resolveModelForAgent`, applies demotion for budget (unless protected) or promotion for quality, returns base tier for balanced
- `applyLoopBudgetMultiplier(baseValue: number, profile: TokenProfile): number` — budget: `Math.max(1, Math.floor(baseValue * 0.5))`, balanced: identity, quality: `baseValue * 2`

Import `resolveModelForAgent` from `./model-routing` (sibling file). Import `ModelTier`, `ComplexityLevel` from `../__schemas/complexity.schemas`. This file has no other src/ imports (respects T0 tier).

Export everything named. No default exports. Full JSDoc on every exported symbol.

**Files to create/edit:**

- `src/complexity/__helpers/token-profile.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes with no new errors
- `resolveModelWithProfile("lu-cognition", "MODERATE", "budget")` returns `"fast"` (already at floor — no change)
- `resolveModelWithProfile("lu-planner", "MODERATE", "budget")` returns `"fast"` (balanced demoted to fast)
- `resolveModelWithProfile("lu-executor", "MODERATE", "budget")` returns `"balanced"` (protected — not demoted)
- `resolveModelWithProfile("lu-planner", "MODERATE", "quality")` returns `"capable"` (balanced promoted)
- `resolveModelWithProfile("lu-planner", "MODERATE", "balanced")` returns `"balanced"` (no change)
- `applyLoopBudgetMultiplier(2, "budget")` returns `1`
- `applyLoopBudgetMultiplier(1, "budget")` returns `1` (floor)
- `applyLoopBudgetMultiplier(2, "quality")` returns `4`

### 2. Export token-profile from complexity barrel

**Type:** auto
**TDD:** false
**Depends on:** 1

Add the new `token-profile.ts` exports to `src/complexity/index.ts` so consumers can import via `~/complexity` barrel. Follow the existing barrel-only re-export pattern.

**Files to create/edit:**

- `src/complexity/index.ts` (edit — add re-exports from `./token-profile`)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `import { resolveModelWithProfile } from "~/complexity"` resolves without error

### 3. Wire --profile flag into lu.skill.ts orchestrator

**Type:** auto
**TDD:** false
**Depends on:** 2

Update `src/skills/luca/lu.skill.ts` to:

1. **Parse `--profile` flag in Step 1 (Parse Args):** Extract `--profile=budget|balanced|quality` from ARGS. Default to `"balanced"` when absent. Validate against the three allowed values; if invalid, warn and fall back to `"balanced"`.

2. **Store profile in state in Step 4 (Configure Session):** After reading `TOKEN_PROFILE` from config.json (existing code), apply CLI override: if `--profile` was provided, it takes precedence over the config.json value. Then store the resolved profile via:

   ```bash
   luca-bridge set-field --field=token_profile --value='"${TOKEN_PROFILE}"' 2>/dev/null || true
   ```

3. **Print profile at session start (Step 1 or Step 2 output block):** After resolving, emit:

   ```
   Token profile: {TOKEN_PROFILE}
   ```

   Include this in whatever session-start summary is printed.

4. **Warn on COMPLEX+budget mismatch (after Step 2 classifies complexity):** After COMPLEXITY is resolved, if `TOKEN_PROFILE == "budget"` and `COMPLEXITY` is `COMPLEX` or `CRITICAL`, emit:

   ```
   WARNING: --profile=budget with COMPLEX/CRITICAL complexity — model demotion may reduce quality.
   ```

5. **Apply profile to Agent() model resolution:** In Steps 7e–7l (all Agent() calls), replace every `ORCHESTRATOR_MODEL` / `DEEP_MODEL` / `FAST_PROMOTED_MODEL` resolution with a profile-aware lookup. Document the pattern inline:

   ```
   # Profile-aware model resolution:
   # resolveModelWithProfile(subagent_type, COMPLEXITY, TOKEN_PROFILE)
   # fast→haiku, balanced→sonnet, capable→opus
   # Protected agents (lu-executor, lu-discuss-researcher, code-architect,
   #   dx-advocate, security-auditor, code-simplifier, lu-learner) ignore budget demotion.
   ```

   The actual calls remain Agent() with a concrete model string resolved at runtime by the orchestrator LLM using the documented rule above.

6. **Apply profile to v2 research pipeline gating (Step 7d-v2):** The TOKEN_PROFILE controls whether the v2 research pipeline runs and how many review iterations execute:
   - `budget`: Skip the entire v2 research pipeline (set WORKFLOW_VERSION to skip v2 regardless of config)
   - `balanced`: Use the config's `researchReviewIterations` value (default 1, no review loop change)
   - `quality`: Use the config's `researchReviewIterations` value doubled (via `applyLoopBudgetMultiplier`)

   Document this gating inline in Step 7d-v2 with a comment block.

7. **Apply profile to loop budgets (Step 7i harness fix loop, Step 7j verify, complexity matrix reads):** When reading `HARNESS_FIX_ITERATIONS`, `PLAN_VERIFICATION_ITERATIONS`, and `VERIFY_FIX_ITERATIONS` from the complexity matrix, apply `applyLoopBudgetMultiplier` semantics inline:
   - budget: halve (floor 1)
   - quality: double
   - balanced: no change

   Document the multiplier rule as a comment above each loop budget variable initialization.

The skill document is generated from TypeScript source (`createSkill`), so edits go to the TypeScript `luSkillConfig.sections[0].content` string.

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (edit)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- The compiled skill content (after `bun run build:all` — which must be run manually by user) includes `--profile` in the Arguments line
- The compiled SKILL.md contains the profile-aware model resolution comment block
- Grep for `token_profile` in compiled output confirms bridge write call is present

### 4. Update lu.skill.ts Arguments line and agent type mapping table

**Type:** auto
**TDD:** false
**Depends on:** 3

In `lu.skill.ts`, the `**Arguments:**` line in the skill content must include `[--profile=budget|balanced|quality]`. The table header for agent type mapping should note that model values are profile-adjusted. This ensures the compiled SKILL.md accurately documents the new flag for the LLM executing the skill.

Also add `token-profile` to the `## Agent Type Mapping` section note: "Model tiers shown are for `balanced` profile. `budget` demotes non-protected agents one tier; `quality` promotes all agents one tier."

**Files to create/edit:**

- `src/skills/luca/lu.skill.ts` (edit — these are additive changes to the content string)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Arguments string in the content includes `--profile=`
- Model tier table has the profile note

## Verification

1. `bunx --bun tsc --noEmit` — zero errors across the full repo
2. `src/complexity/__helpers/token-profile.ts` exists and exports `resolveModelWithProfile`, `applyLoopBudgetMultiplier`, `PROTECTED_AGENTS`, `demoteTier`, `promoteTier`
3. `src/complexity/index.ts` re-exports all token-profile symbols
4. `src/skills/luca/lu.skill.ts` compiles cleanly and the content string contains: `--profile=`, `token_profile`, profile-aware model resolution comment, v2 gating by profile, loop budget multiplier documentation
5. No imports were added that violate the T0/T2 module boundary rules (token-profile.ts imports only from sibling `model-routing.ts` and `../__schemas/complexity.schemas`)

## Success Criteria

1. `/lu --profile=budget` — lu.skill.ts orchestrator reads the flag, stores `budget` in state.json token_profile, prints `Token profile: budget`, and documents that non-protected agents receive a demoted model tier with halved loop budgets
2. `/lu --profile=quality` — prints `Token profile: quality`, documents promoted model tiers, doubled loop budgets, and full v2 research pipeline
3. `/lu` without `--profile` — resolves to `balanced`, zero behavioral change from current behavior, profile printed at session start
4. `bunx --bun tsc --noEmit` passes with no new errors

## Output Specification

- **New file:** `src/complexity/__helpers/token-profile.ts` — token profile utilities at T0 tier
- **Modified file:** `src/complexity/index.ts` — barrel re-exports for token-profile symbols
- **Modified file:** `src/skills/luca/lu.skill.ts` — `--profile` flag parsing, state storage, session display, warning, profile-aware model resolution documentation, v2 gating by profile, loop budget multiplier documentation
