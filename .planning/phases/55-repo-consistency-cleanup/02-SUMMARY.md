# Plan 55.2 Summary: Low-Risk Naming & Placement

## Status: COMPLETE

## What Changed

### Task 55.2.1: Move lu-workflow.rule.ts to src/rules/general/

- `git mv src/rules/lu-workflow.rule.ts src/rules/general/lu-workflow.rule.ts`
- Updated import in `src/rules/index.ts` (from `./lu-workflow.rule` to `./general/lu-workflow.rule`)
- Updated re-export in root `index.ts` (from `./src/rules/lu-workflow.rule` to `./src/rules/general/lu-workflow.rule`)
- Updated internal imports in the rule file to use `../` prefix (`../base/base-rule`, `../types/rule.types`)
- Rule is now included in drift detection's registry completeness scan

### Task 55.2.2: Merge profile.types.ts into profile.schemas.ts

- Moved `TechStackProfile` interface from `profile.types.ts` into `profile.schemas.ts`
- Added `BaseRule` type import to `profile.schemas.ts`
- Updated 5 consumer files to import from `profile.schemas` instead of `profile.types`:
  - `src/rules/profiles/index.ts`
  - `src/rules/profiles/typescript/index.ts`
  - `src/rules/profiles/python/index.ts`
  - `src/rules/profiles/go/index.ts`
  - `src/rules/profiles/rust/index.ts`
- Deleted `src/rules/profiles/profile.types.ts`

### Task 55.2.3: Rename Zod schema objects to PascalCase+Schema convention

- **agent.schemas.ts**: `cognitionTierSchema` -> `CognitionTierSchema`, `cognitionConfigSchema` -> `CognitionConfigSchema`, `agentFrontmatterSchema` -> `AgentFrontmatterSchema`, `agentSectionSchema` -> `AgentSectionSchema`, `agentConfigSchema` -> `AgentConfigSchema`
- **skill.schemas.ts**: `skillFrontmatterSchema` -> `SkillFrontmatterSchema`, `skillSectionSchema` -> `SkillSectionSchema`, `skillConfigSchema` -> `SkillConfigSchema`
- **rule.schemas.ts**: `ruleFrontmatterSchema` -> `RuleFrontmatterSchema`, `ruleSectionSchema` -> `RuleSectionSchema`, `ruleConfigSchema` -> `RuleConfigSchema`
- **profile.schemas.ts**: `profileConfigSchema` -> `ProfileConfigSchema`
- Updated all consumers: `base-agent.ts`, `base-skill.ts`, `base-rule.ts`, `validation-utils.ts`, `src/rules/index.ts`, `src/rules/profiles/index.ts`, `scripts/build-shared.ts`, `__tests__/src/rules/profiles/profile-config.test.ts`, `src/agents/general/lu-test-writer.agent.ts` (doc string)

### Task 55.2.4: Rename Zod-inferred type exports to plain PascalCase

- **agent.schemas.ts**: `CognitionTierSchema` (type) -> `CognitionTier`, `CognitionConfigSchemaType` -> `CognitionConfig`, `AgentFrontmatterSchema` (type) -> `AgentFrontmatter`, `AgentSectionSchema` (type) -> `AgentSection`, `AgentConfigSchema` (type) -> `AgentConfig`
- **skill.schemas.ts**: `SkillFrontmatterSchema` (type) -> `SkillFrontmatter`, `SkillSectionSchema` (type) -> `SkillSection`, `SkillConfigSchema` (type) -> `SkillConfig`
- **rule.schemas.ts**: `RuleFrontmatterSchema` (type) -> `RuleFrontmatter`, `RuleSectionSchema` (type) -> `RuleSection`, `RuleConfigSchema` (type) -> `RuleConfig`
- Updated `.types.ts` re-exports to alias new names back to old names for backward compatibility
- Updated `agent.types.ts` to import `CognitionConfig` (was `CognitionConfigSchemaType`) and use it in the interface field
- Updated `__tests__/utils/fixtures.ts` to use new type names

### Task 55.2.5: Standardize import grouping in all touched files

- Reordered imports in `base-agent.ts`, `base-skill.ts`, `base-rule.ts`: value imports first, type imports last
- Reordered imports in `validation-utils.ts`: value imports grouped, blank line, type imports grouped
- Reordered imports in `src/rules/index.ts`: external (node:fs, node:path) first, internal, relative, types last

### Task 55.2.6: Full verification

- `bun run build:all` -- 327 files built successfully
- `bun test` -- 1763 tests pass, 0 failures
- `bun run check:drift` -- no drift detected

## Files Modified: 22

### Moved (1)

- `src/rules/lu-workflow.rule.ts` -> `src/rules/general/lu-workflow.rule.ts`

### Deleted (1)

- `src/rules/profiles/profile.types.ts`

### Modified (20)

- `src/agents/types/agent.schemas.ts`
- `src/agents/types/agent.types.ts`
- `src/agents/base/base-agent.ts`
- `src/agents/general/lu-test-writer.agent.ts`
- `src/skills/types/skill.schemas.ts`
- `src/skills/types/skill.types.ts`
- `src/skills/base/base-skill.ts`
- `src/rules/types/rule.schemas.ts`
- `src/rules/types/rule.types.ts`
- `src/rules/base/base-rule.ts`
- `src/rules/index.ts`
- `src/rules/profiles/profile.schemas.ts`
- `src/rules/profiles/index.ts`
- `src/rules/profiles/typescript/index.ts`
- `src/rules/profiles/python/index.ts`
- `src/rules/profiles/go/index.ts`
- `src/rules/profiles/rust/index.ts`
- `src/shared/validation-utils.ts`
- `scripts/build-shared.ts`
- `index.ts`

### Test files modified (2)

- `__tests__/utils/fixtures.ts`
- `__tests__/src/rules/profiles/profile-config.test.ts`

## Deviations

None. All tasks executed as planned.

## Verification Results

| Check                     | Result            |
| ------------------------- | ----------------- |
| `bun run build:all`       | 327 files built   |
| `bun test`                | 1763 pass, 0 fail |
| `bun run check:drift`     | No drift          |
| `bunx --bun tsc --noEmit` | Clean (0 errors)  |

---

_Completed: 2026-02-26_
_Executor: lu-executor_
_Branch: 22--comprehensive-repo-consistency-cleanup_
