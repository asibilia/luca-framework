# Plan 15-02 Summary: Agent Schema & Tier Resolution Infrastructure

## Status: COMPLETE

## Commits

| Task | Commit    | Description                                                    |
| ---- | --------- | -------------------------------------------------------------- |
| 1    | `5e74dc4` | Add cognition tier and config schemas to agent.schemas.ts      |
| 2    | `8b3071f` | Add CognitionTier and CognitionConfig types to agent.types.ts  |
| 3    | `32e092b` | Add cognitionPromotions to ComplexityGate and defaults         |
| 4    | `027e9c7` | Create resolveEffectiveTier function for tier resolution       |
| 5    | `8e587f4` | Emit YAML frontmatter with cognition config in Claude compiler |

## Files Modified

- `src/agents/types/agent.schemas.ts` -- Added `cognitionTierSchema`, `cognitionConfigSchema`, extended `agentFrontmatterSchema` with optional `cognition`, exported inferred types
- `src/agents/types/agent.types.ts` -- Added `CognitionTier` type, `CognitionConfig` interface, extended `AgentFrontmatter`, re-exported schema types
- `src/complexity/types.ts` -- Added optional `cognitionPromotions` field to `ComplexityGate` interface, imported `CognitionTier`
- `src/complexity/defaults.ts` -- Populated `cognitionPromotions` for COMPLEX (`T1->T2`, `T2->T3`) and CRITICAL (`T0->T1`, `T1->T2`, `T2->T3`)
- `src/compilers/claude.compiler.ts` -- Updated `compileAgent` to prepend YAML frontmatter when cognition config present

## Files Created

- `src/agents/cognition/resolve-tier.ts` -- Pure `resolveEffectiveTier()` function + exported `TIER_ORDER` constant

## Verification

- **Typecheck**: No errors in any modified or created files (pre-existing errors in test files and packages are unrelated)
- **Build**: `bun run build:all` succeeds -- 25 agents, 37 skills, 22 rules compiled (178 files total)
- **Backward Compatibility**: Confirmed no agents emit YAML frontmatter until Plan 15-04 adds cognition config to agent frontmatter

## Design Notes

- Schema fields use `snake_case` per API convention: `default_tier`, `promotable_to`, `memory_tags`
- File names use `kebab-case`: `resolve-tier.ts`
- Functional pattern: `resolveEffectiveTier` is a pure function, not a class method
- Cognition promotions use tier-to-tier mapping (T1->T2) rather than agent-name-keyed mapping, as decided in the plan. Per-agent limits handled by `promotable_to` ceiling in agent frontmatter.
- `TIER_ORDER` exported separately for reuse by other modules needing tier comparison

## Deviations

None. All 5 tasks executed as specified.
