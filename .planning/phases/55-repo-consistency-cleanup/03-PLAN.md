---
id: "55.3"
title: "Schema Consolidation — Zod-Only Types"
wave: 3
depends_on: ["55.2"]
tasks:
  - id: "55.3.1"
    title: "Convert BaseAgent/BaseSkill/BaseRule interfaces to function type signatures"
    files:
      [
        "src/agents/types/agent.schemas.ts",
        "src/skills/types/skill.schemas.ts",
        "src/rules/types/rule.schemas.ts",
      ]
    verify: "Behavior contracts are function types, not interfaces. tsc passes."
  - id: "55.3.2"
    title: "Delete agent.types.ts — migrate all consumers to agent.schemas.ts"
    files:
      [
        "src/agents/types/agent.types.ts",
        "src/agents/types/agent.schemas.ts",
        "src/agents/index.ts",
        "src/agents/base/base-agent.ts",
        "src/compilers/compile.ts",
        "src/agents/cognition/resolve-tier.ts",
      ]
    verify: "agent.types.ts deleted, all src/ imports point to agent.schemas.ts, tsc passes"
  - id: "55.3.3"
    title: "Delete skill.types.ts — migrate all consumers to skill.schemas.ts"
    files:
      [
        "src/skills/types/skill.types.ts",
        "src/skills/types/skill.schemas.ts",
        "src/skills/index.ts",
        "src/skills/base/base-skill.ts",
        "src/compilers/compile.ts",
      ]
    verify: "skill.types.ts deleted, all src/ imports point to skill.schemas.ts, tsc passes"
  - id: "55.3.4"
    title: "Delete rule.types.ts — migrate all consumers to rule.schemas.ts"
    files:
      [
        "src/rules/types/rule.types.ts",
        "src/rules/types/rule.schemas.ts",
        "src/rules/index.ts",
        "src/rules/base/base-rule.ts",
        "src/compilers/compile.ts",
        "src/rules/profiles/profile.schemas.ts",
      ]
    verify: "rule.types.ts deleted, all src/ imports point to rule.schemas.ts, tsc passes"
  - id: "55.3.5"
    title: "Deduplicate Section type — canonical in src/shared/format.ts"
    files:
      [
        "src/shared/format.ts",
        "src/agents/types/agent.schemas.ts",
        "src/skills/types/skill.schemas.ts",
        "src/rules/types/rule.schemas.ts",
      ]
    verify: "Single Section definition in format.ts, all schemas reference it, no duplicates"
  - id: "55.3.6"
    title: "Remove backward-compat aliases (CognitionTier, CognitionConfig re-exports)"
    files:
      [
        "src/agents/types/agent.schemas.ts",
        "src/complexity/types.ts",
        "src/agents/cognition/resolve-tier.ts",
      ]
    verify: "No alias re-exports remain, all consumers use canonical names"
  - id: "55.3.7"
    title: "Update all test file imports"
    files:
      [
        "__tests__/src/agents/base/base-agent.test.ts",
        "__tests__/src/skills/base/base-skill.test.ts",
        "__tests__/src/rules/base/base-rule.test.ts",
        "__tests__/src/compilers/plugin-compiler.test.ts",
        "__tests__/src/rules/profiles/profile-registry.test.ts",
        "__tests__/utils/test-entities.ts",
        "__tests__/utils/fixtures.ts",
      ]
    verify: "All test files import from .schemas.ts paths, bun test passes"
  - id: "55.3.8"
    title: "Run full build and test suite"
    files: []
    verify: "bun run build:all exits 0, bun test passes all tests, check:drift passes"
---

# Plan 55.3: Schema Consolidation — Zod-Only Types

## Objective

Eliminate all hand-written interfaces that duplicate Zod schemas. After this wave, each entity (agent, skill, rule) has a single `.schemas.ts` file as its sole type definition source. The `.types.ts` files are deleted. This is the highest-impact wave.

## Context

From 55-CONTEXT.md:

- Decision 1: Zod-only for data shapes. Delete hand-written interfaces. Convert behavior contracts to function type signatures.
- Decision 2: Single `.schemas.ts` file per entity. Delete `.types.ts` files.
- Decision 4: Backward-compat aliases (CognitionTier/CognitionConfig re-exports) removed.
- Two-wave migration pattern (from MEMORY P26): Create new exports in .schemas.ts first, verify, then migrate consumers, then delete old files.
- Section type location: Canonical in `src/shared/format.ts`.

## Migration Strategy

For each entity (agent, skill, rule), the migration follows this sequence:

1. **Prepare .schemas.ts** — ensure it exports all needed types under final names (done in Wave 2)
2. **Add behavior contract types** — convert `BaseAgent`/`BaseSkill`/`BaseRule` interfaces to function type signatures in .schemas.ts
3. **Migrate src/ consumers** — update import paths from `.types.ts` to `.schemas.ts`
4. **Migrate test consumers** — update import paths in `__tests__/`
5. **Delete .types.ts** — remove the file
6. **Build + test** — verify nothing broke

## Tasks

### Task 55.3.1: Convert BaseAgent/BaseSkill/BaseRule interfaces to function type signatures

The `BaseAgent`, `BaseSkill`, and `BaseRule` interfaces define behavior contracts (methods like `toCursorFormat()`, `toClaudeFormat()`). Per Decision 1 and the no-classes rule, convert these to function type signatures.

**Current state (agent.types.ts):**

```typescript
export interface BaseAgent {
  readonly config: AgentConfig;
  readonly name: string;
  readonly description: string;
  toCursorFormat(): string;
  toClaudeFormat(): string;
}
```

**Target state (agent.schemas.ts):**

```typescript
/** Behavior contract for an agent instance (functional, not class-based) */
export type BaseAgent = {
  readonly config: AgentConfig;
  readonly name: string;
  readonly description: string;
  toCursorFormat(): string;
  toClaudeFormat(): string;
};
```

The `type` keyword (instead of `interface`) is used because:

- It aligns with the Zod-inferred types pattern (all types via `type` keyword)
- Methods (`toCursorFormat`, `toClaudeFormat`) are not serializable and cannot be Zod schemas
- A `type` alias can reference Zod-inferred types (`AgentConfig`) seamlessly

**Apply the same pattern for BaseSkill and BaseRule.**

**Files:**

- `src/agents/types/agent.schemas.ts` — add `BaseAgent` type
- `src/skills/types/skill.schemas.ts` — add `BaseSkill` type
- `src/rules/types/rule.schemas.ts` — add `BaseRule` type

**Verify:** `bunx --bun tsc --noEmit` passes with new type definitions.

### Task 55.3.2: Delete agent.types.ts — migrate all consumers to agent.schemas.ts

Migrate every consumer of `src/agents/types/agent.types.ts` to import from `src/agents/types/agent.schemas.ts` instead, then delete the file.

**Consumer migration map (from U1 investigation):**

| Consumer File                                  | Current Import                                                                           | New Import                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/agents/base/base-agent.ts`                | `import type { BaseAgent, AgentConfig } from "../types/agent.types"`                     | `import type { BaseAgent, AgentConfig } from "../types/agent.schemas"`                     |
| `src/agents/index.ts`                          | `export type { AgentConfig, AgentFrontmatter, AgentSection } from "./types/agent.types"` | `export type { AgentConfig, AgentFrontmatter, AgentSection } from "./types/agent.schemas"` |
| `src/agents/index.ts`                          | `import type { BaseAgent } from "./types/agent.types"`                                   | `import type { BaseAgent } from "./types/agent.schemas"`                                   |
| `src/compilers/compile.ts`                     | `import type { BaseAgent } from "../agents/types/agent.types"`                           | `import type { BaseAgent } from "../agents/types/agent.schemas"`                           |
| `src/agents/cognition/resolve-tier.ts`         | `import type { CognitionTier } from "../types/agent.types"`                              | `import type { CognitionTier } from "../types/agent.schemas"`                              |
| All `src/agents/general/*.agent.ts` (29 files) | `import type { AgentConfig } from "../types/agent.types"`                                | `import type { AgentConfig } from "../types/agent.schemas"`                                |
| `src/agents/luca/lu-executor.agent.ts`         | `import type { AgentConfig } from "../types/agent.types"`                                | `import type { AgentConfig } from "../types/agent.schemas"`                                |
| `src/agents/luca/lu-planner.agent.ts`          | `import type { AgentConfig } from "../types/agent.types"`                                | `import type { AgentConfig } from "../types/agent.schemas"`                                |

**Steps:**

1. Verify `.schemas.ts` exports all types needed: `AgentFrontmatter`, `AgentSection`, `AgentConfig`, `BaseAgent`, `CognitionTier`, `CognitionConfig`
2. Update all `src/` consumer imports (use find-and-replace: `agent.types` -> `agent.schemas`)
3. Run `bunx --bun tsc --noEmit` to catch any missed imports
4. Delete `src/agents/types/agent.types.ts`
5. Run `bunx --bun tsc --noEmit` again to confirm no broken references

**Files:**

- `src/agents/types/agent.types.ts` (DELETED)
- ~33 consumer files updated (see map above)

**Verify:** `bunx --bun tsc --noEmit` passes, file is deleted.

### Task 55.3.3: Delete skill.types.ts — migrate all consumers to skill.schemas.ts

Same pattern as Task 55.3.2 but for skills.

**Consumer migration map:**

| Consumer File                                  | Current Import                                                                           | New Import                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/skills/base/base-skill.ts`                | `import type { BaseSkill, SkillConfig } from "../types/skill.types"`                     | `import type { BaseSkill, SkillConfig } from "../types/skill.schemas"`                     |
| `src/skills/index.ts`                          | `export type { SkillConfig, SkillFrontmatter, SkillSection } from "./types/skill.types"` | `export type { SkillConfig, SkillFrontmatter, SkillSection } from "./types/skill.schemas"` |
| `src/skills/index.ts`                          | `import type { BaseSkill } from "./types/skill.types"`                                   | `import type { BaseSkill } from "./types/skill.schemas"`                                   |
| `src/compilers/compile.ts`                     | `import type { BaseSkill } from "../skills/types/skill.types"`                           | `import type { BaseSkill } from "../skills/types/skill.schemas"`                           |
| All `src/skills/general/*.skill.ts` (46 files) | `import type { SkillConfig } from "../types/skill.types"`                                | `import type { SkillConfig } from "../types/skill.schemas"`                                |
| `src/skills/luca/lu.skill.ts`                  | `import type { SkillConfig } from "../types/skill.types"`                                | `import type { SkillConfig } from "../types/skill.schemas"`                                |

**Steps:**

1. Verify `.schemas.ts` exports: `SkillFrontmatter`, `SkillSection`, `SkillConfig`, `BaseSkill`
2. Update all consumer imports
3. Delete `src/skills/types/skill.types.ts`
4. Verify with `bunx --bun tsc --noEmit`

**Files:**

- `src/skills/types/skill.types.ts` (DELETED)
- ~50 consumer files updated

**Verify:** `bunx --bun tsc --noEmit` passes, file is deleted.

### Task 55.3.4: Delete rule.types.ts — migrate all consumers to rule.schemas.ts

Same pattern as Task 55.3.2 but for rules.

**Consumer migration map:**

| Consumer File                                     | Current Import                                                                       | New Import                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `src/rules/base/base-rule.ts`                     | `import type { BaseRule, RuleConfig } from "../types/rule.types"`                    | `import type { BaseRule, RuleConfig } from "../types/rule.schemas"`                    |
| `src/rules/index.ts`                              | `export type { RuleConfig, RuleFrontmatter, RuleSection } from "./types/rule.types"` | `export type { RuleConfig, RuleFrontmatter, RuleSection } from "./types/rule.schemas"` |
| `src/rules/index.ts`                              | `import type { BaseRule } from "./types/rule.types"`                                 | `import type { BaseRule } from "./types/rule.schemas"`                                 |
| `src/compilers/compile.ts`                        | `import type { BaseRule } from "../rules/types/rule.types"`                          | `import type { BaseRule } from "../rules/types/rule.schemas"`                          |
| `src/rules/lu-workflow.rule.ts` (now at general/) | `import type { RuleConfig } from "./types/rule.types"`                               | `import type { RuleConfig } from "../types/rule.schemas"`                              |
| All `src/rules/general/*.rule.ts` (10 files)      | `import type { RuleConfig } from "../types/rule.types"`                              | `import type { RuleConfig } from "../types/rule.schemas"`                              |
| `src/rules/profiles/profile.schemas.ts`           | If it imports BaseRule from rule.types                                               | Update to rule.schemas                                                                 |
| All `src/rules/profiles/*/index.ts` (4 files)     | If they import BaseRule                                                              | Update to rule.schemas                                                                 |

**Steps:**

1. Verify `.schemas.ts` exports: `RuleFrontmatter`, `RuleSection`, `RuleConfig`, `BaseRule`
2. Update all consumer imports
3. Delete `src/rules/types/rule.types.ts`
4. Verify with `bunx --bun tsc --noEmit`

**Files:**

- `src/rules/types/rule.types.ts` (DELETED)
- ~17 consumer files updated

**Verify:** `bunx --bun tsc --noEmit` passes, file is deleted.

### Task 55.3.5: Deduplicate Section type — canonical in src/shared/format.ts

The `Section` type is currently defined independently in:

- `src/shared/format.ts` (local `interface Section`)
- `src/agents/types/agent.schemas.ts` (as `AgentSection` via Zod)
- `src/skills/types/skill.schemas.ts` (as `SkillSection` via Zod)
- `src/rules/types/rule.schemas.ts` (as `RuleSection` via Zod)

All four definitions have identical shape: `{ title: string; content: string; order?: number }`.

**Strategy:** Make the canonical `Section` type live in `src/shared/format.ts` as a Zod schema, then have the entity schemas reference it.

**Steps:**

1. In `src/shared/format.ts`, convert the local `interface Section` to a Zod schema:
   ```typescript
   import { z } from "zod";
   export const SectionSchema = z.object({
     title: z.string(),
     content: z.string(),
     order: z.number().optional(),
   });
   export type Section = z.infer<typeof SectionSchema>;
   ```
2. In each entity `.schemas.ts`, replace the local section schema definition with a reference:
   ```typescript
   import { SectionSchema, type Section } from "../../shared/format";
   // Remove local agentSectionSchema / skillSectionSchema / ruleSectionSchema
   // Use SectionSchema directly in the config schema
   export const AgentConfigSchema = z.object({
     frontmatter: AgentFrontmatterSchema,
     sections: z.array(SectionSchema),
   });
   ```
3. Keep the per-entity type aliases for backward compatibility if needed:
   ```typescript
   export type AgentSection = Section; // Alias for discoverability
   ```
4. Update `src/shared/format.ts` functions to use the exported `Section` type instead of the local interface

**Files:**

- `src/shared/format.ts` (export SectionSchema + Section type)
- `src/agents/types/agent.schemas.ts` (import Section, remove local)
- `src/skills/types/skill.schemas.ts` (import Section, remove local)
- `src/rules/types/rule.schemas.ts` (import Section, remove local)

**Verify:** `bunx --bun tsc --noEmit` passes, only one `Section` definition exists.

### Task 55.3.6: Remove backward-compat aliases

Delete the re-export aliases added for backward compatibility in `agent.types.ts` (now deleted) and any remaining alias patterns.

**Specific aliases to remove:**

1. `agent.types.ts` had: `export type { CognitionTierSchema as CognitionTier }` and `export type { CognitionConfigSchemaType as CognitionConfig }` -- these are gone since the file is deleted
2. In `agent.schemas.ts`, verify no duplicate aliases remain. After Wave 2 renaming, the canonical names should be:
   - `CognitionTier` (was `CognitionTierSchema` type)
   - `CognitionConfig` (was `CognitionConfigSchemaType`)
3. In `src/complexity/types.ts` line 11: `import type { CognitionTier } from "../agents/types/agent.types"` -- update to import from `agent.schemas`

**Consumers of CognitionTier/CognitionConfig:**

- `src/complexity/types.ts` — imports CognitionTier for `ComplexityGate.cognitionPromotions`
- `src/agents/cognition/resolve-tier.ts` — imports CognitionTier
- `src/complexity/defaults.ts` — uses ComplexityGate which references CognitionTier

**Files:**

- `src/agents/types/agent.schemas.ts` (verify clean exports)
- `src/complexity/types.ts` (update import path)
- `src/agents/cognition/resolve-tier.ts` (already updated in 55.3.2)

**Verify:** No `as CognitionTier` or `as CognitionConfig` alias re-exports exist anywhere. `bunx --bun tsc --noEmit` passes.

### Task 55.3.7: Update all test file imports

Update every test file that imported from `.types.ts` files to import from `.schemas.ts` instead.

**Files to update (from U2 investigation):**

| Test File                                               | Old Import Source                          | New Import Source                                |
| ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `__tests__/src/agents/base/base-agent.test.ts`          | `agent.types`                              | `agent.schemas`                                  |
| `__tests__/src/skills/base/base-skill.test.ts`          | `skill.types`                              | `skill.schemas`                                  |
| `__tests__/src/rules/base/base-rule.test.ts`            | `rule.types`                               | `rule.schemas`                                   |
| `__tests__/src/compilers/plugin-compiler.test.ts`       | `agent.types`, `skill.types`, `rule.types` | `agent.schemas`, `skill.schemas`, `rule.schemas` |
| `__tests__/utils/test-entities.ts`                      | `agent.types`, `skill.types`, `rule.types` | `agent.schemas`, `skill.schemas`, `rule.schemas` |
| `__tests__/utils/fixtures.ts`                           | Already imports from `.schemas`            | Verify names match Wave 2 renames                |
| `__tests__/src/rules/profiles/profile-registry.test.ts` | `rule.types`                               | `rule.schemas`                                   |

**Steps:**

1. Find-and-replace `agent.types` with `agent.schemas` across `__tests__/`
2. Find-and-replace `skill.types` with `skill.schemas` across `__tests__/`
3. Find-and-replace `rule.types` with `rule.schemas` across `__tests__/`
4. Verify `__tests__/utils/fixtures.ts` uses the renamed schema/type names from Wave 2
5. Run `bun test` to verify all tests pass

**Files:** 7+ test files (see table above)

**Verify:** `bun test` passes all tests.

### Task 55.3.8: Run full build and test suite

Final verification for Wave 3.

**Commands:**

```bash
# SHA-256 checksum of outputs BEFORE build (for R1 verification)
find .claude .cursor dist/plugin -type f -name "*.md" -o -name "*.mdc" -o -name "*.json" -o -name "*.sh" | sort | xargs shasum -a 256 > /tmp/pre-build-checksums.txt

# Full build
bun run build:all

# SHA-256 checksum of outputs AFTER build
find .claude .cursor dist/plugin -type f -name "*.md" -o -name "*.mdc" -o -name "*.json" -o -name "*.sh" | sort | xargs shasum -a 256 > /tmp/post-build-checksums.txt

# Compare checksums (should be identical — internal type changes should not affect compiled output)
diff /tmp/pre-build-checksums.txt /tmp/post-build-checksums.txt

# Full test suite
bun test

# Drift check
bun run check:drift
```

**Verify:** All commands pass. Checksum diff should be empty (internal type restructuring should not change compiled markdown output).

## Wave Dependencies

- Depends on Plan 55.2 (Wave 2) completion
- Specifically needs: Zod schema naming convention applied (Tasks 55.2.3-55.2.4)
- Uses U1 consumer map from Wave 1 investigation

## Success Criteria

1. **Zero .types.ts files** in `src/agents/types/`, `src/skills/types/`, `src/rules/types/`
2. **Single source of truth** — each entity has one `.schemas.ts` file for all type definitions
3. **BaseAgent/BaseSkill/BaseRule** are function type signatures, not interfaces
4. **Section type** is canonical in `src/shared/format.ts`, deduplicated from all entity schemas
5. **No backward-compat aliases** remain
6. `bun run build:all` passes
7. `bun test` passes all tests
8. `bun run check:drift` passes
9. Compiled output checksums unchanged (internal refactoring only)

## Verification

```bash
# Verify .types.ts files are deleted
test ! -f src/agents/types/agent.types.ts && echo "PASS: agent.types.ts deleted"
test ! -f src/skills/types/skill.types.ts && echo "PASS: skill.types.ts deleted"
test ! -f src/rules/types/rule.types.ts && echo "PASS: rule.types.ts deleted"

# Verify no stale imports remain
grep -rn "from.*agent\.types" src/ --include="*.ts" && echo "FAIL: stale agent.types import" || echo "PASS: no stale agent.types imports"
grep -rn "from.*skill\.types" src/ --include="*.ts" && echo "FAIL: stale skill.types import" || echo "PASS: no stale skill.types imports"
grep -rn "from.*rule\.types" src/ --include="*.ts" | grep -v "plugin.types" && echo "FAIL: stale rule.types import" || echo "PASS: no stale rule.types imports"

# Full verification
bun run build:all
bun test
bun run check:drift
```
