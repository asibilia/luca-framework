---
id: "55.2"
title: "Low-Risk Naming & Placement"
wave: 2
depends_on: ["55.1"]
tasks:
  - id: "55.2.1"
    title: "Move lu-workflow.rule.ts to src/rules/general/"
    files: ["src/rules/lu-workflow.rule.ts", "src/rules/index.ts"]
    verify: "File exists at new path, import updated, bun run build:all passes, check-drift passes"
  - id: "55.2.2"
    title: "Rename profile.types.ts to inline into profile.schemas.ts"
    files:
      [
        "src/rules/profiles/profile.types.ts",
        "src/rules/profiles/profile.schemas.ts",
        "src/rules/profiles/index.ts",
      ]
    verify: "TechStackProfile interface moved into profile.schemas.ts, profile.types.ts deleted, all imports updated"
  - id: "55.2.3"
    title: "Rename Zod schema objects to PascalCase+Schema convention"
    files:
      [
        "src/agents/types/agent.schemas.ts",
        "src/skills/types/skill.schemas.ts",
        "src/rules/types/rule.schemas.ts",
        "src/rules/profiles/profile.schemas.ts",
      ]
    verify: "All Zod objects follow FooSchema naming, all consumers updated, bun run build:all passes"
  - id: "55.2.4"
    title: "Rename Zod-inferred type exports to plain PascalCase"
    files:
      [
        "src/agents/types/agent.schemas.ts",
        "src/skills/types/skill.schemas.ts",
        "src/rules/types/rule.schemas.ts",
      ]
    verify: "All inferred types are Foo (not FooSchema), no naming collisions, all consumers updated"
  - id: "55.2.5"
    title: "Standardize import grouping in touched files"
    files:
      [
        "src/agents/base/base-agent.ts",
        "src/skills/base/base-skill.ts",
        "src/rules/base/base-rule.ts",
        "src/compilers/compile.ts",
      ]
    verify: "Imports follow grouping standard: external, internal, relative, types"
  - id: "55.2.6"
    title: "Run full build and test suite"
    files: []
    verify: "bun run build:all exits 0, bun test passes all ~1763 tests, check:drift passes"
---

# Plan 55.2: Low-Risk Naming & Placement

## Objective

Execute low-risk file renames, directory moves, and naming convention standardization. These are mechanical changes with well-defined blast radius. Every change is verified immediately via build and test.

## Context

From 55-CONTEXT.md:

- Decision 2: Zod objects = `FooSchema` (PascalCase + Schema suffix). Inferred types = `Foo` (plain PascalCase).
- Decision 5: Move `lu-workflow.rule.ts` to `src/rules/general/` via git mv.
- Wave 2 is low-risk: git mv + import updates only.
- Risk mitigation R1: Run `bun run build:all` after every wave.

## Tasks

### Task 55.2.1: Move lu-workflow.rule.ts to src/rules/general/

Move the sole misplaced rule file from the rules root into the `general/` directory where all other general rules reside.

**Steps:**

1. `git mv src/rules/lu-workflow.rule.ts src/rules/general/lu-workflow.rule.ts`
2. Update import in `src/rules/index.ts`:
   - Change: `import { luWorkflowRule } from "./lu-workflow.rule";`
   - To: `import { luWorkflowRule } from "./general/lu-workflow.rule";`
3. Update internal imports inside `lu-workflow.rule.ts` to use `../` prefix (matching all other general rules):
   - `import { createRule } from "./base/base-rule"` → `import { createRule } from "../base/base-rule"`
   - `import type { RuleConfig } from "./types/rule.types"` → `import type { RuleConfig } from "../types/rule.types"`
4. Verify the registry completeness test at `__tests__/scripts/check-drift.test.ts` now includes `lu-workflow.rule.ts` in its scan of `src/rules/general/`

**Files:**

- `src/rules/lu-workflow.rule.ts` (moved)
- `src/rules/index.ts` (import path updated)

**Verify:** `bun run build:all` passes, `bun test __tests__/scripts/check-drift.test.ts` passes (registry completeness now includes lu-workflow).

### Task 55.2.2: Merge profile.types.ts into profile.schemas.ts

The `TechStackProfile` interface in `profile.types.ts` is the only export. Move it into `profile.schemas.ts` and delete the file. This follows Decision 2: single `.schemas.ts` file per entity.

**Steps:**

1. Read `src/rules/profiles/profile.types.ts` — contains `TechStackProfile` interface importing `BaseRule`
2. Move the `TechStackProfile` interface definition into `src/rules/profiles/profile.schemas.ts`
3. Update all imports:
   - `src/rules/profiles/index.ts`: Change `import type { TechStackProfile } from "./profile.types"` to `import type { TechStackProfile } from "./profile.schemas"`
   - `src/rules/profiles/index.ts`: Update re-export to come from `"./profile.schemas"`
   - `src/rules/index.ts`: Verify re-export chain still works (imports from `./profiles/index`)
4. Delete `src/rules/profiles/profile.types.ts`

**Note:** `TechStackProfile` is currently a hand-written interface that references `BaseRule`. In Wave 3, both will be converted to Zod-derived types. For now, just move the interface as-is.

**Consumer list (from U2 investigation):**

- `src/rules/profiles/index.ts` — imports and re-exports TechStackProfile
- `src/rules/index.ts` — re-exports TechStackProfile from profiles/index
- `src/rules/profiles/typescript/index.ts`, `python/index.ts`, `go/index.ts`, `rust/index.ts` — use TechStackProfile as return type (imported from `../profile.types`)

**Files:**

- `src/rules/profiles/profile.types.ts` (deleted)
- `src/rules/profiles/profile.schemas.ts` (gains TechStackProfile)
- `src/rules/profiles/index.ts` (import source updated)
- `src/rules/profiles/typescript/index.ts` (import source updated)
- `src/rules/profiles/python/index.ts` (import source updated)
- `src/rules/profiles/go/index.ts` (import source updated)
- `src/rules/profiles/rust/index.ts` (import source updated)

**Verify:** `bun run build:all` passes, no broken imports.

### Task 55.2.3: Rename Zod schema objects to PascalCase+Schema convention

Currently, Zod schema objects use camelCase (e.g., `agentFrontmatterSchema`). Rename to PascalCase+Schema (e.g., `AgentFrontmatterSchema`).

**Current -> Target naming:**

**agent.schemas.ts:**
| Current | Target |
|---------|--------|
| `cognitionTierSchema` | `CognitionTierSchema` |
| `cognitionConfigSchema` | `CognitionConfigSchema` |
| `agentFrontmatterSchema` | `AgentFrontmatterSchema` |
| `agentSectionSchema` | `AgentSectionSchema` |
| `agentConfigSchema` | `AgentConfigSchema` |

**skill.schemas.ts:**
| Current | Target |
|---------|--------|
| `skillFrontmatterSchema` | `SkillFrontmatterSchema` |
| `skillSectionSchema` | `SkillSectionSchema` |
| `skillConfigSchema` | `SkillConfigSchema` |

**rule.schemas.ts:**
| Current | Target |
|---------|--------|
| `ruleFrontmatterSchema` | `RuleFrontmatterSchema` |
| `ruleSectionSchema` | `RuleSectionSchema` |
| `ruleConfigSchema` | `RuleConfigSchema` |

**profile.schemas.ts:**
| Current | Target |
|---------|--------|
| `profileConfigSchema` | `ProfileConfigSchema` |

**Consumer updates required:**

- `src/agents/base/base-agent.ts` — uses `agentConfigSchema`
- `src/skills/base/base-skill.ts` — uses `skillConfigSchema`
- `src/rules/base/base-rule.ts` — uses `ruleConfigSchema`
- `src/agents/types/agent.schemas.ts` — defines + uses `cognitionConfigSchema` in `agentFrontmatterSchema`
- `src/context/types.ts` — uses `contextConfigSchema` (already PascalCase-ish, check)
- `src/rules/profiles/index.ts` — re-exports `profileConfigSchema`
- `src/rules/index.ts` — uses `profileConfigSchema`
- `__tests__/utils/fixtures.ts` — imports schemas by camelCase name

**IMPORTANT:** This is a rename-in-place. Use find-and-replace across affected files. The Zod schema objects are values (not types), so TypeScript will catch any missed references as compile errors.

**Files:** All `.schemas.ts` files plus all consumers listed above.

**Verify:** `bunx --bun tsc --noEmit` passes, `bun run build:all` passes.

### Task 55.2.4: Rename Zod-inferred type exports to plain PascalCase

Currently, inferred types from Zod schemas have a `Schema` suffix (e.g., `AgentFrontmatterSchema` for the type, `CognitionConfigSchemaType`). Rename to plain PascalCase (e.g., `AgentFrontmatter`, `CognitionConfig`).

**Current -> Target naming:**

**agent.schemas.ts:**
| Current Type Export | Target |
|---------------------|--------|
| `type CognitionTierSchema = z.infer<...>` | `type CognitionTier = z.infer<...>` |
| `type CognitionConfigSchemaType = z.infer<...>` | `type CognitionConfig = z.infer<...>` |
| `type AgentFrontmatterSchema = z.infer<...>` | `type AgentFrontmatter = z.infer<...>` |
| `type AgentSectionSchema = z.infer<...>` | `type AgentSection = z.infer<...>` |
| `type AgentConfigSchema = z.infer<...>` | `type AgentConfig = z.infer<...>` |

**COLLISION WARNING:** After this rename, the inferred types will have the same names as the hand-written interfaces in `agent.types.ts`. This is intentional -- Wave 3 deletes the interfaces. For now, both coexist: the `.schemas.ts` file exports `AgentFrontmatter` (Zod-inferred) and `.types.ts` still has its own `AgentFrontmatter` interface. Consumers that import from `.types.ts` are unchanged in this wave; only `.schemas.ts` and its direct consumers are updated.

**skill.schemas.ts:**
| Current Type Export | Target |
|---------------------|--------|
| `type SkillFrontmatterSchema` | `type SkillFrontmatter` |
| `type SkillSectionSchema` | `type SkillSection` |
| `type SkillConfigSchema` | `type SkillConfig` |

**rule.schemas.ts:**
| Current Type Export | Target |
|---------------------|--------|
| `type RuleFrontmatterSchema` | `type RuleFrontmatter` |
| `type RuleSectionSchema` | `type RuleSection` |
| `type RuleConfigSchema` | `type RuleConfig` |

**Consumer updates:**

- `src/agents/types/agent.types.ts` — update (a) the `export type {}` re-export declarations, (b) the `import type { CognitionConfigSchemaType }` import on line 5 (rename to `CognitionConfig`), and (c) the `cognition?: CognitionConfigSchemaType` field in the `AgentFrontmatter` interface body
- `src/skills/types/skill.types.ts` — re-exports from skill.schemas (update names in re-export)
- `src/rules/types/rule.types.ts` — re-exports from rule.schemas (update names in re-export)
- `__tests__/utils/fixtures.ts` — imports schema types by name

**Files:** All `.schemas.ts` files plus `.types.ts` re-export lines.

**Verify:** `bunx --bun tsc --noEmit` passes, `bun run build:all` passes.

### Task 55.2.5: Standardize import grouping in touched files

For every file modified in Tasks 55.2.1-55.2.4, audit and fix import grouping to match the import-standards rule:

1. External libraries (zod, node:fs, etc.)
2. Internal packages (relative cross-module)
3. Relative imports (same module)
4. Type-only imports

**Files:** All files touched in this wave (base-agent.ts, base-skill.ts, base-rule.ts, compile.ts, all .schemas.ts files, all profile index files, etc.)

**Verify:** Visual inspection of import ordering in all touched files.

### Task 55.2.6: Run full build and test suite

Final verification for Wave 2.

**Commands:**

```bash
# Full build
bun run build:all

# Full test suite
bun test

# Drift check
bun run check:drift
```

**Verify:** All three commands pass with zero errors.

## Wave Dependencies

- Depends on Plan 55.1 (Wave 1) completion with investigation report populated
- Specifically needs U2 findings (test import audit) and U3 findings (lu-workflow placement)

## Success Criteria

1. `lu-workflow.rule.ts` lives at `src/rules/general/lu-workflow.rule.ts`
2. `profile.types.ts` is deleted; `TechStackProfile` lives in `profile.schemas.ts`
3. All Zod schema objects use PascalCase+Schema convention
4. All Zod-inferred types use plain PascalCase convention
5. `bun run build:all` passes
6. `bun test` passes all tests
7. `bun run check:drift` passes

## Verification

```bash
# Verify file moves
test -f src/rules/general/lu-workflow.rule.ts && echo "OK: lu-workflow moved"
test ! -f src/rules/lu-workflow.rule.ts && echo "OK: old location removed"
test ! -f src/rules/profiles/profile.types.ts && echo "OK: profile.types.ts deleted"

# Verify naming convention
grep -c "export const [A-Z].*Schema = z\." src/agents/types/agent.schemas.ts  # Should match all schema objects

# Full verification
bun run build:all
bun test
bun run check:drift
```
