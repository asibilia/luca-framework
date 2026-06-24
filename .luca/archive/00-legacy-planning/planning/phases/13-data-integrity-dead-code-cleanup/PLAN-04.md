---
phase: 13
plan: 4
type: improvement
autonomous: true
wave: 2
depends_on: [1]
gap_closure: true
findings: [H4]
---

# Phase 13 Plan 04: DRY validation-utils.ts and Fix T0-to-T2 Boundary Inversion

## Objective

Deduplicate the 3 near-identical `safeValidate*Config` functions in `src/shared/__helpers/validation-utils.ts` into a single generic `safeValidate` function, and resolve the T0-to-T2 boundary inversion where shared (T0) imports from agents/skills/rules (T2). This is the only documented cross-tier exception in `module-boundary.md` and it should be resolved properly.

## Context

- @src/shared/\_\_helpers/validation-utils.ts (3 near-identical `safeValidate*Config` functions + T0->T2 imports)
- @src/shared/index.ts (barrel that re-exports all 6 validate functions)
- @.claude/rules/module-boundary.md (documents the T0->T2 exception that this plan resolves)
- @.claude/rules/domain-architecture.md (T0 Foundation must not import from T2 Entity)
- @src/agents/\_\_schemas/agent.schemas.ts (AgentConfigSchema)
- @src/skills/\_\_schemas/skill.schemas.ts (SkillConfigSchema)
- @src/rules/\_\_schemas/rule.schemas.ts (RuleConfigSchema)

**Architecture context:** The module boundary rule states T0 (shared) must never import from T2 (agents, skills, rules). The current `validation-utils.ts` violates this by importing `AgentConfigSchema`, `SkillConfigSchema`, and `RuleConfigSchema`. The documented exception in `module-boundary.md` acknowledges this violation and says it should be resolved.

## Tasks

### 1. Create a generic safeValidate helper in validation-utils.ts

**Type:** auto
**TDD:** false
**Depends on:** none

Replace the 3 near-identical `safeValidate*Config` functions with a single generic function:

```typescript
/**
 * Validate a config object against a Zod schema with error handling.
 *
 * @param schema - The Zod schema to validate against
 * @param config - The config object to validate
 * @returns Result with validated data or error message
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  config: unknown,
): Result<T> {
  try {
    const data = schema.parse(config);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Validation failed",
    };
  }
}
```

This generic function can replace all 3 specific variants:

- `safeValidateAgentConfig(config)` -> `safeValidate(AgentConfigSchema, config)`
- `safeValidateSkillConfig(config)` -> `safeValidate(SkillConfigSchema, config)`
- `safeValidateRuleConfig(config)` -> `safeValidate(RuleConfigSchema, config)`

**Files to edit:**

- `src/shared/__helpers/validation-utils.ts`

**Verification:**

- Generic `safeValidate` function exists and accepts `z.ZodSchema<T>`
- Old specific functions are removed
- `bunx --bun tsc --noEmit` passes

### 2. Remove T2 imports from validation-utils.ts and move entity-specific validators to their domains

**Type:** auto
**TDD:** false
**Depends on:** 1

Remove all T2 (entity) imports from `src/shared/__helpers/validation-utils.ts`:

1. Remove imports of `AgentConfigSchema`, `SkillConfigSchema`, `RuleConfigSchema`
2. Remove imports of `AgentConfig`, `SkillConfig`, `RuleConfig` types
3. Remove the non-safe wrappers too: `validateAgentConfig`, `validateSkillConfig`, `validateRuleConfig`
4. Keep: `sanitizeJsonParse`, `safeSanitizeJsonParse`, `stripPrototypeKeys`, `DANGEROUS_KEYS`, and the new generic `safeValidate`

The entity-specific validate functions should move to their respective domains if they are actually used. Check for consumers first:

- If `validateAgentConfig` / `safeValidateAgentConfig` are called elsewhere, create thin wrappers in `src/agents/__helpers/` that use the generic `safeValidate` from shared
- Same pattern for skills and rules
- If no consumers exist outside the removed code, simply delete them

**Files to edit:**

- `src/shared/__helpers/validation-utils.ts` (remove T2 imports and entity-specific functions)
- `src/agents/__helpers/` (add entity-specific validator if needed)
- `src/skills/__helpers/` (add entity-specific validator if needed)
- `src/rules/__helpers/` (add entity-specific validator if needed)

**Verification:**

- `grep -n "~/agents\|~/skills\|~/rules" src/shared/__helpers/validation-utils.ts` returns 0 results
- No T2 imports remain in any T0 file
- `bunx --bun tsc --noEmit` passes

### 3. Update shared/index.ts barrel exports

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Update `src/shared/index.ts` to reflect the new API:

1. Remove exports of deleted functions: `validateAgentConfig`, `validateSkillConfig`, `validateRuleConfig`, `safeValidateAgentConfig`, `safeValidateSkillConfig`, `safeValidateRuleConfig`
2. Add export of the new generic `safeValidate` function
3. Keep exports of `sanitizeJsonParse` and `safeSanitizeJsonParse`

**Files to edit:**

- `src/shared/index.ts`

**Verification:**

- Barrel only exports functions that exist in validation-utils.ts
- `bunx --bun tsc --noEmit` passes

### 4. Update module-boundary.md to remove the resolved exception

**Type:** auto
**TDD:** false
**Depends on:** 2

Remove the documented T0->T2 exception from `src/rules/general/module-boundary.rule.ts` (which compiles to `.claude/rules/module-boundary.md`):

The exception table currently has:

```
| shared/__helpers/validation-utils.ts | agents/skills/rules __schemas/ | Config validation helpers reference entity schemas (T0 -> T2) |
```

This entry should be removed since the violation is now resolved.

**Files to edit:**

- `src/rules/general/module-boundary.rule.ts` (source for module-boundary.md)

**CRITICAL:** This file compiles to `.claude/rules/module-boundary.md`. Do NOT run `bun run build:all` during the session -- note it as a manual step.

**Verification:**

- Exception entry removed from module-boundary rule source
- `bunx --bun tsc --noEmit` passes
- **Post-plan manual step:** `bun run build:all` to regenerate rule files

### 5. Update consumers of removed validate functions

**Type:** auto
**TDD:** false
**Depends on:** 2, 3

Search the codebase for any callers of the removed functions and update them:

```bash
grep -rn "validateAgentConfig\|validateSkillConfig\|validateRuleConfig\|safeValidateAgentConfig\|safeValidateSkillConfig\|safeValidateRuleConfig" src/
```

For each consumer found:

- If calling from within the entity's own domain (e.g., agents calling `validateAgentConfig`), update to use the domain-local wrapper or call `safeValidate(AgentConfigSchema, config)` directly
- If calling from a non-entity domain, update to use `safeValidate` with the appropriate schema

**Files to edit:**

- Any files found by the grep search above

**Verification:**

- No references to removed functions remain
- `bunx --bun tsc --noEmit` passes

## Verification

- Zero T2 imports in `src/shared/__helpers/validation-utils.ts`: `grep -n "~/agents\|~/skills\|~/rules" src/shared/__helpers/validation-utils.ts` returns 0 results
- Type check passes: `bunx --bun tsc --noEmit`
- Module boundary check passes: `bun run scripts/check-domain-boundaries.ts` (if it validates tier compliance)
- No references to removed functions remain in `src/`
- **Manual step required:** User must run `bun run build:all` after this plan completes

## Success Criteria

- H4 closed: 3 near-identical safeValidate functions replaced with 1 generic function
- H4 closed: T0->T2 boundary inversion resolved (shared no longer imports from entity domains)
- Module boundary exception documentation updated
- No regressions in type checking

## Output Specification

- Updated `src/shared/__helpers/validation-utils.ts` (DRY, no T2 imports)
- Updated `src/shared/index.ts` (new exports)
- Possibly new entity-specific validator files in agents/skills/rules `__helpers/`
- Updated `src/rules/general/module-boundary.rule.ts` (exception removed)
- **Post-plan manual step:** `bun run build:all`
