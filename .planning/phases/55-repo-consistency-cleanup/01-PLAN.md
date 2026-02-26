---
id: "55.1"
title: "Investigation — Resolve All Unknowns"
wave: 1
depends_on: []
tasks:
  - id: "55.1.1"
    title: "Audit AgentFrontmatter consumers (U1)"
    files:
      ["src/agents/types/agent.types.ts", "src/agents/types/agent.schemas.ts"]
    verify: "Complete consumer list documented with import source (interface vs Zod-inferred)"
  - id: "55.1.2"
    title: "Audit test imports affected by renames (U2)"
    files: ["__tests__/"]
    verify: "Complete list of test files importing from paths that will change in Waves 2-3"
  - id: "55.1.3"
    title: "Verify lu-workflow.rule.ts placement semantics (U3)"
    files: ["src/rules/lu-workflow.rule.ts", "src/rules/index.ts"]
    verify: "Confirmed whether placement at rules root affects registry ordering or discovery"
  - id: "55.1.4"
    title: "Audit harness config loading for unsafe casts (U4)"
    files: ["src/harness/runner.ts", "src/harness/types.ts"]
    verify: "Documented how config.json harness section is loaded and where unsafe casts occur"
  - id: "55.1.5"
    title: "Map check-drift.test.ts output paths (U5)"
    files:
      [
        "__tests__/scripts/check-drift.test.ts",
        "scripts/check-drift.ts",
        "scripts/build-shared.ts",
      ]
    verify: "Complete list of output paths validated by drift detection"
---

# Plan 55.1: Investigation — Resolve All Unknowns

## Objective

Resolve all 5 unknowns (U1-U5) from the context document before any code changes begin. This is a READ-ONLY wave: no source files are modified. The output is an investigation report appended to this plan that subsequent waves use as their reference.

## Context

From 55-CONTEXT.md:

- Wave 1 is read-only, zero risk
- All unknowns must be answered before Waves 2-4 begin code changes
- R5 mitigation: Wave 1 investigation catches indirect consumers before code changes

## Tasks

### Task 55.1.1: Audit AgentFrontmatter consumers (U1)

Determine which consumers import `AgentFrontmatter` (the hand-written interface from `agent.types.ts`) vs `AgentFrontmatterSchema` (the Zod-inferred type from `agent.schemas.ts`). This determines the migration surface for Wave 3.

**Search commands:**

```bash
# Find all imports of AgentFrontmatter interface
grep -rn "AgentFrontmatter" src/ __tests__/ scripts/ --include="*.ts"

# Find all imports of AgentFrontmatterSchema (Zod-inferred)
grep -rn "AgentFrontmatterSchema" src/ __tests__/ scripts/ --include="*.ts"

# Also check for the other parallel types
grep -rn "AgentSection\b" src/ __tests__/ --include="*.ts"
grep -rn "AgentConfig\b" src/ __tests__/ --include="*.ts"
grep -rn "BaseAgent\b" src/ __tests__/ --include="*.ts"
```

**Files to examine:**

- `src/agents/types/agent.types.ts` — defines the hand-written interfaces
- `src/agents/types/agent.schemas.ts` — defines the Zod schemas + inferred types
- `src/agents/base/base-agent.ts` — imports both
- `src/agents/index.ts` — re-exports from agent.types.ts
- `src/compilers/compile.ts` — imports BaseAgent
- `src/agents/cognition/resolve-tier.ts` — imports CognitionTier
- All `src/agents/general/*.agent.ts` — import AgentConfig
- All `src/agents/luca/*.agent.ts` — import AgentConfig

Do the same analysis for Skill and Rule parallel types:

- `SkillFrontmatter`/`SkillConfig`/`BaseSkill` from `skill.types.ts` vs `skill.schemas.ts`
- `RuleFrontmatter`/`RuleConfig`/`BaseRule` from `rule.types.ts` vs `rule.schemas.ts`

**Verify:** Complete consumer map for all 3 entity type systems (agent, skill, rule) showing which consumers import from `.types.ts` vs `.schemas.ts`.

### Task 55.1.2: Audit test imports affected by renames (U2)

Identify every test file in `__tests__/` that imports from paths that will change in Waves 2 and 3. This includes:

- Imports from `agent.types.ts`, `skill.types.ts`, `rule.types.ts` (deleted in Wave 3)
- Imports from `agent.schemas.ts`, `skill.schemas.ts`, `rule.schemas.ts` (may be renamed)
- Imports from `profile.types.ts` (deleted in Wave 3)
- Imports from `src/rules/lu-workflow.rule.ts` (moved in Wave 2)

**Search commands:**

```bash
# Test files importing from .types.ts files
grep -rn "from.*agent\.types" __tests__/ --include="*.ts"
grep -rn "from.*skill\.types" __tests__/ --include="*.ts"
grep -rn "from.*rule\.types" __tests__/ --include="*.ts"
grep -rn "from.*profile\.types" __tests__/ --include="*.ts"

# Test files importing from .schemas.ts files
grep -rn "from.*agent\.schemas" __tests__/ --include="*.ts"
grep -rn "from.*skill\.schemas" __tests__/ --include="*.ts"
grep -rn "from.*rule\.schemas" __tests__/ --include="*.ts"

# Test files importing from harness/types or complexity/types (Wave 4)
grep -rn "from.*harness/types" __tests__/ --include="*.ts"
grep -rn "from.*complexity/types" __tests__/ --include="*.ts"

# Test files importing from compile.ts (may reference type names)
grep -rn "from.*compilers/compile" __tests__/ --include="*.ts"
```

**Known affected test files (from initial scan):**

- `__tests__/src/compilers/plugin-compiler.test.ts` — imports AgentConfig, SkillConfig, RuleConfig from .types.ts
- `__tests__/utils/test-entities.ts` — imports AgentConfig, SkillConfig, RuleConfig from .types.ts
- `__tests__/utils/fixtures.ts` — imports from .schemas.ts files
- `__tests__/src/rules/base/base-rule.test.ts` — imports RuleConfig from rule.types.ts
- `__tests__/src/skills/base/base-skill.test.ts` — imports SkillConfig from skill.types.ts
- `__tests__/src/agents/base/base-agent.test.ts` — imports AgentConfig from agent.types.ts
- `__tests__/src/rules/profiles/profile-registry.test.ts` — imports BaseRule from rule.types.ts
- `__tests__/src/harness/config.test.ts` — imports from harness/types
- `__tests__/src/harness/runner.test.ts` — imports from harness/types
- `__tests__/src/iteration/convergence.test.ts` — imports ParsedError from harness/types
- `__tests__/src/iteration/classifier.test.ts` — imports ParsedError, CheckResult from harness/types

**Verify:** Complete, exhaustive list of test files and the specific imports that need updating per wave.

### Task 55.1.3: Verify lu-workflow.rule.ts placement semantics (U3)

Determine whether `src/rules/lu-workflow.rule.ts` being at the rules root (not in `general/`) serves any functional purpose for registry ordering or discovery.

**Analysis steps:**

1. Read `src/rules/index.ts` — see how `luWorkflowRule` is imported (currently `from "./lu-workflow.rule"`)
2. Check if the rule registry (`generalRules` object) treats it differently from other rules
3. Verify that rule loading in `scripts/build-shared.ts` does not reference directory paths
4. Check `__tests__/scripts/check-drift.test.ts` — does registry completeness check scan `src/rules/general/` specifically?
5. Confirm the rule is keyed as `"lu-workflow"` in the registry regardless of file location

**Key observation from scan:**

- `src/rules/index.ts` line 26: `import { luWorkflowRule } from "./lu-workflow.rule";` — imported from root
- `src/rules/index.ts` line 67: `"lu-workflow": () => luWorkflowRule` — registered identically to other general rules
- `__tests__/scripts/check-drift.test.ts` line 181-191: Registry completeness test scans `src/rules/general/` directory for `*.rule.ts` files. If `lu-workflow.rule.ts` is moved to `general/`, it will be included in completeness checks automatically.

**Verify:** Documented whether the move to `src/rules/general/` requires any changes beyond: (a) `git mv`, (b) import path update in `src/rules/index.ts`.

### Task 55.1.4: Audit harness config loading for unsafe casts (U4)

Examine how `src/harness/runner.ts` loads configuration from `.planning/config.json` and identify unsafe type casts.

**Analysis steps:**

1. Read `src/harness/runner.ts` `loadHarnessConfig()` function
2. Trace how `raw.harness` is accessed and cast
3. Identify the `as HarnessConfig` unsafe cast on line 23
4. Document what validation is missing (no Zod schema, no safeParse)
5. Compare with how other modules load config (e.g., `src/rules/index.ts` uses `profileConfigSchema.parse()`)

**Known issue from scan:**

- `src/harness/runner.ts` line 23: `return raw.harness as HarnessConfig;` — direct unsafe cast, no validation
- `DEFAULT_HARNESS_CONFIG` on line 31 is defined in `src/harness/types.ts` using the interface, not a Zod schema

**Verify:** Documented the specific unsafe cast locations and what a Zod migration would need to validate.

### Task 55.1.5: Map check-drift.test.ts output paths (U5)

Enumerate all output paths that `check-drift.test.ts` and `check-drift.ts` validate, to ensure no rename in Waves 2-4 breaks drift detection.

**Analysis steps:**

1. Read `__tests__/scripts/check-drift.test.ts` — identify all path filters
2. Read `scripts/check-drift.ts` — identify stale file detection directories
3. List all output directories: `.claude/agents/`, `.claude/skills/`, `.claude/rules/`, `.cursor/agents/`, `.cursor/skills/`, `.cursor/rules/`, `.claude/hooks/`, `.cursor/hooks/`, `dist/plugin/agents/`, `dist/plugin/skills/`, `dist/plugin/commands/`, `dist/plugin/scripts/`
4. Confirm drift detection uses registry keys (not file paths) for validation

**Known from scan:**

- Drift detection compares `generateAllOutputs()` Map against disk files
- Registry completeness checks scan source directories: `src/agents/general/`, `src/skills/general/`, `src/rules/general/`, `src/hooks/scripts/`
- Orphan detection scans output directories against registry keys
- No output path references entity type file names (.types.ts, .schemas.ts)
- The lu-workflow rule rename WILL be caught by registry completeness if it is moved to `general/` but NOT yet added to the scan

**Verify:** Complete path map showing which paths are validated and confirming that internal type file renames do not affect drift detection.

## Wave Dependencies

None. This is the first wave.

## Success Criteria

1. All 5 unknowns (U1-U5) have documented answers
2. No code changes were made
3. Consumer maps are complete enough that Waves 2-4 can proceed without discovery work
4. Investigation report section below is filled in with findings

## Verification

```bash
# No code changes should exist after Wave 1
git diff --stat  # Should show only this PLAN file with investigation results
```

---

## Investigation Report

> **This section is populated by the executor during Wave 1 execution.**

### U1: AgentFrontmatter Consumer Map

#### Pattern: Hand-Written Interfaces (from `.types.ts`) vs Zod-Inferred Types (from `.schemas.ts`)

All three entity type systems (agent, skill, rule) follow the same dual-layer pattern:

- `.types.ts` defines hand-written interfaces AND re-exports the Zod-inferred types from `.schemas.ts`
- `.schemas.ts` defines Zod schemas and exports `z.infer<>` types
- The `.types.ts` file imports the Zod schemas it re-exports (lines 7-14 of `agent.types.ts`, lines 5-10 of `skill.types.ts`, lines 5-10 of `rule.types.ts`)

**Key structural observation:** The hand-written interfaces in `.types.ts` are structurally identical to the Zod-inferred types in `.schemas.ts`. They exist in parallel without any structural divergence. The `.types.ts` files re-export the Zod schema types under `*Schema` suffixed names.

#### Agent Consumer Map

**Consumers of hand-written interfaces from `agent.types.ts`:**

| Consumer File                                | Imported Symbol(s)                                             | Source                                                    |
| -------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| `src/agents/base/base-agent.ts:7`            | `BaseAgent`, `AgentConfig`                                     | `../types/agent.types`                                    |
| `src/compilers/compile.ts:18`                | `BaseAgent`                                                    | `../agents/types/agent.types`                             |
| `src/shared/validation-utils.ts:8`           | `AgentConfig`                                                  | `../agents/types/agent.types`                             |
| `src/agents/index.ts:42-50`                  | `AgentConfig`, `AgentFrontmatter`, `AgentSection`, `BaseAgent` | `./types/agent.types` (re-export)                         |
| `src/agents/cognition/resolve-tier.ts:9`     | `CognitionTier`                                                | `../types/agent.types` (re-export of Zod-inferred)        |
| `src/complexity/types.ts:11`                 | `CognitionTier`                                                | `../agents/types/agent.types` (re-export of Zod-inferred) |
| `src/rules/profiles/profile.types.ts:8`      | `BaseRule`                                                     | `../types/rule.types`                                     |
| `index.ts:10-14`                             | `AgentFrontmatter`, `AgentSection`, `AgentConfig`, `BaseAgent` | `./src/agents/types/agent.types` (re-export)              |
| All 24 `src/agents/general/*.agent.ts` files | `AgentConfig`                                                  | `../types/agent.types`                                    |
| Both `src/agents/luca/*.agent.ts` files      | `AgentConfig`                                                  | `../types/agent.types`                                    |

**Consumers of Zod-inferred types from `agent.schemas.ts`:**

| Consumer File                            | Imported Symbol(s)                                                                                                      | Source                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `src/agents/types/agent.types.ts:5,9-14` | `CognitionConfigSchemaType`, `AgentFrontmatterSchema`, `AgentSectionSchema`, `AgentConfigSchema`, `CognitionTierSchema` | `./agent.schemas` (re-exports)         |
| `__tests__/utils/fixtures.ts:24-25`      | `AgentConfigSchema`                                                                                                     | `../../src/agents/types/agent.schemas` |
| `src/shared/validation-utils.ts:5`       | `agentConfigSchema` (Zod runtime schema)                                                                                | `../agents/types/agent.schemas`        |

**Total agent consumer count:** 30+ files import from `agent.types.ts`, only 3 files import directly from `agent.schemas.ts`.

#### Skill Consumer Map

**Consumers of hand-written interfaces from `skill.types.ts`:**

| Consumer File                                 | Imported Symbol(s)                                             | Source                                       |
| --------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| `src/skills/base/base-skill.ts:7`             | `BaseSkill`, `SkillConfig`                                     | `../types/skill.types`                       |
| `src/compilers/compile.ts:19`                 | `BaseSkill`                                                    | `../skills/types/skill.types`                |
| `src/shared/validation-utils.ts:9`            | `SkillConfig`                                                  | `../skills/types/skill.types`                |
| `src/skills/index.ts:60-67`                   | `SkillConfig`, `SkillFrontmatter`, `SkillSection`, `BaseSkill` | `./types/skill.types` (re-export)            |
| `index.ts:17-20`                              | `SkillFrontmatter`, `SkillSection`, `SkillConfig`, `BaseSkill` | `./src/skills/types/skill.types` (re-export) |
| All 35+ `src/skills/general/*.skill.ts` files | `SkillConfig`                                                  | `../types/skill.types`                       |
| `src/skills/luca/lu.skill.ts:5`               | `SkillConfig`                                                  | `../types/skill.types`                       |

**Consumers of Zod-inferred types from `skill.schemas.ts`:**

| Consumer File                         | Imported Symbol(s)                                                  | Source                                 |
| ------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `src/skills/types/skill.types.ts:7-9` | `SkillFrontmatterSchema`, `SkillSectionSchema`, `SkillConfigSchema` | `./skill.schemas` (re-exports)         |
| `__tests__/utils/fixtures.ts:28-29`   | `SkillConfigSchema`                                                 | `../../src/skills/types/skill.schemas` |
| `src/shared/validation-utils.ts:6`    | `skillConfigSchema` (Zod runtime schema)                            | `../skills/types/skill.schemas`        |

**Total skill consumer count:** 40+ files import from `skill.types.ts`, only 3 files import directly from `skill.schemas.ts`.

#### Rule Consumer Map

**Consumers of hand-written interfaces from `rule.types.ts`:**

| Consumer File                                         | Imported Symbol(s)                                         | Source                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `src/rules/base/base-rule.ts:7`                       | `BaseRule`, `RuleConfig`                                   | `../types/rule.types`                      |
| `src/compilers/compile.ts:20`                         | `BaseRule`                                                 | `../rules/types/rule.types`                |
| `src/shared/validation-utils.ts:10`                   | `RuleConfig`                                               | `../rules/types/rule.types`                |
| `src/rules/index.ts:40-47`                            | `RuleConfig`, `RuleFrontmatter`, `RuleSection`, `BaseRule` | `./types/rule.types` (re-export)           |
| `src/rules/profiles/profile.types.ts:8`               | `BaseRule`                                                 | `../types/rule.types`                      |
| `index.ts:24-27`                                      | `RuleFrontmatter`, `RuleSection`, `RuleConfig`, `BaseRule` | `./src/rules/types/rule.types` (re-export) |
| All 11 `src/rules/general/*.rule.ts` files            | `RuleConfig`                                               | `../types/rule.types`                      |
| All 8 `src/rules/profiles/typescript/*.rule.ts` files | `RuleConfig`                                               | `../../types/rule.types`                   |
| `src/rules/lu-workflow.rule.ts:5`                     | `RuleConfig`                                               | `./types/rule.types`                       |

**Consumers of Zod-inferred types from `rule.schemas.ts`:**

| Consumer File                       | Imported Symbol(s)                                               | Source                               |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `src/rules/types/rule.types.ts:7-9` | `RuleFrontmatterSchema`, `RuleSectionSchema`, `RuleConfigSchema` | `./rule.schemas` (re-exports)        |
| `__tests__/utils/fixtures.ts:32-33` | `RuleConfigSchema`                                               | `../../src/rules/types/rule.schemas` |
| `src/shared/validation-utils.ts:7`  | `ruleConfigSchema` (Zod runtime schema)                          | `../rules/types/rule.schemas`        |

**Total rule consumer count:** 25+ files import from `rule.types.ts`, only 3 files import directly from `rule.schemas.ts`.

#### Migration Impact Summary for Wave 3

If `.types.ts` files are deleted and consumers are pointed to `.schemas.ts`:

- **30+ agent consumers** need import path updates (from `agent.types` to `agent.schemas` or a unified re-export)
- **40+ skill consumers** need import path updates
- **25+ rule consumers** need import path updates
- **Alternative approach:** Keep `.types.ts` as a thin re-export barrel that re-exports from `.schemas.ts`, minimizing consumer churn. The `.types.ts` files already re-export Zod types; the change would be to delete the hand-written interfaces and make `.types.ts` re-export only from `.schemas.ts`.

### U2: Test Import Audit

#### Test files importing from `.types.ts` (will be affected if deleted in Wave 3)

| Test File                                                 | Imported Symbol(s) | Import Source                              |
| --------------------------------------------------------- | ------------------ | ------------------------------------------ |
| `__tests__/utils/test-entities.ts:9`                      | `AgentConfig`      | `../../src/agents/types/agent.types`       |
| `__tests__/utils/test-entities.ts:10`                     | `SkillConfig`      | `../../src/skills/types/skill.types`       |
| `__tests__/utils/test-entities.ts:11`                     | `RuleConfig`       | `../../src/rules/types/rule.types`         |
| `__tests__/src/compilers/plugin-compiler.test.ts:21`      | `AgentConfig`      | `../../../src/agents/types/agent.types`    |
| `__tests__/src/compilers/plugin-compiler.test.ts:22`      | `SkillConfig`      | `../../../src/skills/types/skill.types`    |
| `__tests__/src/compilers/plugin-compiler.test.ts:23`      | `RuleConfig`       | `../../../src/rules/types/rule.types`      |
| `__tests__/src/agents/base/base-agent.test.ts:9`          | `AgentConfig`      | `../../../../src/agents/types/agent.types` |
| `__tests__/src/skills/base/base-skill.test.ts:10`         | `SkillConfig`      | `../../../../src/skills/types/skill.types` |
| `__tests__/src/rules/base/base-rule.test.ts:10`           | `RuleConfig`       | `../../../../src/rules/types/rule.types`   |
| `__tests__/src/rules/profiles/profile-registry.test.ts:3` | `BaseRule`         | `../../../../src/rules/types/rule.types`   |

**Total: 10 import statements across 7 test files** need updating if `.types.ts` paths change.

#### Test files importing from `.schemas.ts` (may be affected by renames in Wave 2)

| Test File                           | Imported Symbol(s)  | Import Source                          |
| ----------------------------------- | ------------------- | -------------------------------------- |
| `__tests__/utils/fixtures.ts:24-25` | `AgentConfigSchema` | `../../src/agents/types/agent.schemas` |
| `__tests__/utils/fixtures.ts:28-29` | `SkillConfigSchema` | `../../src/skills/types/skill.schemas` |
| `__tests__/utils/fixtures.ts:32-33` | `RuleConfigSchema`  | `../../src/rules/types/rule.schemas`   |

**Total: 3 import statements in 1 test file** need updating if `.schemas.ts` paths change.

#### Test files importing from `harness/types` (Wave 4 migration target)

| Test File                                       | Imported Symbol(s)                     | Import Source                   |
| ----------------------------------------------- | -------------------------------------- | ------------------------------- |
| `__tests__/src/harness/config.test.ts:3`        | `DEFAULT_HARNESS_CONFIG`               | `../../../src/harness/types`    |
| `__tests__/src/harness/runner.test.ts:3`        | `DEFAULT_HARNESS_CONFIG`               | `../../../src/harness/types`    |
| `__tests__/src/harness/runner.test.ts:4`        | `HarnessConfig` (type)                 | `../../../src/harness/types`    |
| `__tests__/src/iteration/convergence.test.ts:2` | `ParsedError` (type)                   | `../../../src/harness/types`    |
| `__tests__/src/iteration/classifier.test.ts:2`  | `ParsedError`, `CheckResult` (types)   | `../../../src/harness/types`    |
| `__tests__/src/memory/quality-scorer.test.ts:7` | `HarnessResult`, `CheckResult` (types) | `../../../src/harness/types.ts` |

**Total: 6 import statements across 5 test files** need updating if harness types are migrated.

#### Test files importing from `complexity/types`

No test files import directly from `complexity/types`. The complexity module's types are consumed via `src/complexity/index.ts` re-exports.

#### Test files importing from `profile.types`

No test files import from `profile.types.ts`. The `profile-registry.test.ts` imports `BaseRule` from `rule.types.ts` and `profileRegistry` from the profiles index.

#### Test files importing from `lu-workflow.rule.ts`

No test files import directly from `src/rules/lu-workflow.rule.ts`. It is only imported by `src/rules/index.ts` and `index.ts`.

#### Summary by Wave

| Wave                            | Files Affected                | Import Statements to Update |
| ------------------------------- | ----------------------------- | --------------------------- |
| Wave 2 (schema renames)         | `__tests__/utils/fixtures.ts` | 3                           |
| Wave 3 (type file deletion)     | 7 test files                  | 10                          |
| Wave 4 (harness type migration) | 5 test files                  | 6                           |
| **Total**                       | **10 unique test files**      | **19**                      |

### U3: lu-workflow.rule.ts Placement

#### Current State

- File location: `src/rules/lu-workflow.rule.ts` (at rules root, not in `general/`)
- Import in `src/rules/index.ts` line 26: `import { luWorkflowRule } from "./lu-workflow.rule";`
- Registration in `src/rules/index.ts` line 67: `"lu-workflow": () => luWorkflowRule` (inside `generalRules` object)
- Re-export in `index.ts` line 60: `export { luWorkflowRule } from "./src/rules/lu-workflow.rule";`
- Internal import: `import type { RuleConfig } from "./types/rule.types";` (line 5, relative path from rules root)

#### Registry Behavior

The `lu-workflow` rule is registered identically to all other general rules in the `generalRules` object (lines 56-68 of `src/rules/index.ts`). The registry is a flat `Record<string, () => BaseRule>` keyed by rule name strings. **File location has zero effect on registry ordering or discovery** -- the key is the string `"lu-workflow"`, not a directory path.

#### Drift Detection Impact

The registry completeness test in `__tests__/scripts/check-drift.test.ts` (lines 180-191) scans `src/rules/general/` for `*.rule.ts` files and checks each against `ruleRegistry` keys. Currently, `lu-workflow.rule.ts` is NOT in `src/rules/general/`, so it is NOT scanned by this completeness test. **Moving it to `general/` will automatically include it in the completeness scan** -- this is a benefit, not a risk.

#### What Moving Requires

1. `git mv src/rules/lu-workflow.rule.ts src/rules/general/lu-workflow.rule.ts`
2. Update `src/rules/index.ts` line 26: change `from "./lu-workflow.rule"` to `from "./general/lu-workflow.rule"`
3. Update `index.ts` line 60: change `from "./src/rules/lu-workflow.rule"` to `from "./src/rules/general/lu-workflow.rule"`
4. Update internal import in the rule file itself: change `from "./types/rule.types"` to `from "../types/rule.types"` and `from "./base/base-rule"` to `from "../base/base-rule"`

**No other changes needed.** No test files import from this file. No registry key or ordering changes. The move is purely mechanical.

### U4: Harness Config Loading

#### Unsafe Cast Location

- **File:** `src/harness/runner.ts` line 24
- **Code:** `return raw.harness as HarnessConfig;`
- **Context:** Inside `loadHarnessConfig()` function (lines 16-32). The function reads `.planning/config.json`, parses it with `Bun.file().json()`, and if `raw.harness` exists, casts it directly to `HarnessConfig` with no validation.

#### What Validation Is Missing

1. **No Zod schema** exists for `HarnessConfig`. The type is defined as a hand-written TypeScript interface in `src/harness/types.ts` (lines 19-24).
2. **No `safeParse` or `parse` call** is made on the config data. Compare with `src/rules/index.ts` line 89 which uses `profileConfigSchema.parse(workflow)` for its config loading.
3. **No prototype pollution protection.** The config is loaded via `Bun.file().json()` which is `JSON.parse` without the `sanitizeJsonParse` wrapper used elsewhere (e.g., `src/rules/index.ts` line 87).
4. **No partial/default merging.** If `raw.harness` exists but is missing fields (e.g., no `checks` array, no `failFast`), the cast would produce a `HarnessConfig` with `undefined` fields. The fallback on line 31 (`return { ...DEFAULT_HARNESS_CONFIG }`) only runs when `raw.harness` is falsy.

#### DEFAULT_HARNESS_CONFIG Definition

- **File:** `src/harness/types.ts` lines 61-71
- **Definition:** A const object satisfying the `HarnessConfig` interface, with `enabled: true`, `maxFixIterations: 3`, `failFast: false`, and 4 default checks (test, typecheck, lint disabled, build disabled).
- **Not a Zod schema default.** This is a plain object, not derived from `z.object().default()`.

#### What a Zod Migration Would Need

1. Create `src/harness/schemas.ts` with:
   - `checkConfigSchema` for `CheckConfig`
   - `harnessConfigSchema` for `HarnessConfig` with `.default()` values matching `DEFAULT_HARNESS_CONFIG`
2. In `loadHarnessConfig()`: replace `return raw.harness as HarnessConfig` with `return harnessConfigSchema.parse(raw.harness)` (or `safeParse` with fallback)
3. Add prototype pollution protection: use `sanitizeJsonParse` instead of `Bun.file().json()`
4. Export `harnessConfigSchema` for consumers that need runtime validation
5. Optionally unify `DEFAULT_HARNESS_CONFIG` as `harnessConfigSchema.parse({})` instead of a separate constant

#### Test Impact

5 test files import from `src/harness/types`:

- `config.test.ts` imports `DEFAULT_HARNESS_CONFIG`
- `runner.test.ts` imports `DEFAULT_HARNESS_CONFIG` and `HarnessConfig` type
- `convergence.test.ts` imports `ParsedError` type
- `classifier.test.ts` imports `ParsedError`, `CheckResult` types
- `quality-scorer.test.ts` imports `HarnessResult`, `CheckResult` types

If harness types are split into `types.ts` + `schemas.ts` (Wave 4), these 5 test files need import path updates.

### U5: Drift Detection Paths

#### Output Directories Validated by Drift Detection

The drift detection system validates these output paths via `generateAllOutputs()`:

**IDE output paths (check-drift.test.ts "Output Freshness" section):**

| Output Path Pattern                     | Entity Type | Format          |
| --------------------------------------- | ----------- | --------------- |
| `.claude/agents/{name}.md`              | Agents      | Claude          |
| `.cursor/agents/{name}.md`              | Agents      | Cursor          |
| `.claude/skills/{name}/SKILL.md`        | Skills      | Claude          |
| `.cursor/skills/{name}/SKILL.md`        | Skills      | Cursor          |
| `.claude/rules/{name}.md`               | Rules       | Claude          |
| `.cursor/rules/{name}.mdc`              | Rules       | Cursor          |
| `.claude/hooks/{script}.sh`             | Hooks       | Script copy     |
| `.cursor/hooks/{script}.sh`             | Hooks       | Script copy     |
| `.claude/settings.json` (hooks section) | Hooks       | Config fragment |
| `.cursor/hooks.json`                    | Hooks       | Config file     |

**Plugin output paths (check-drift.test.ts "Plugin Output Freshness" section):**

| Output Path Pattern                           | Entity Type            |
| --------------------------------------------- | ---------------------- |
| `dist/plugin/agents/{name}.md`                | Agents                 |
| `dist/plugin/skills/{name}/SKILL.md`          | Skills                 |
| `dist/plugin/commands/{name}.md`              | Commands (from skills) |
| `dist/plugin/scripts/{script}.sh`             | Hooks                  |
| `dist/plugin/hooks/hooks.json`                | Hook config            |
| `dist/plugin/.claude-plugin/plugin.json`      | Plugin manifest        |
| `dist/plugin/.claude-plugin/marketplace.json` | Marketplace manifest   |
| `dist/plugin/README.md`                       | README                 |

#### Source Directories Scanned for Registry Completeness

| Source Directory      | File Pattern | Registry Checked |
| --------------------- | ------------ | ---------------- |
| `src/agents/general/` | `*.agent.ts` | `agentRegistry`  |
| `src/skills/general/` | `*.skill.ts` | `skillRegistry`  |
| `src/rules/general/`  | `*.rule.ts`  | `ruleRegistry`   |
| `src/hooks/scripts/`  | `*.sh`       | `hookRegistry`   |

#### Stale File Detection Directories (check-drift.ts)

| Directory        | Extension | Purpose                                         |
| ---------------- | --------- | ----------------------------------------------- |
| `.claude/rules/` | `.md`     | Detects stale rule files from disabled profiles |
| `.cursor/rules/` | `.mdc`    | Detects stale rule files from disabled profiles |

#### Impact of Internal Type File Renames on Drift Detection

**No impact.** Drift detection operates on:

1. **Output paths** generated by `generateAllOutputs()` -- these use registry keys (`agentRegistry`, `skillRegistry`, `ruleRegistry`) not source file paths
2. **Source directory scans** for registry completeness -- these scan entity files (`*.agent.ts`, `*.skill.ts`, `*.rule.ts`), not type definition files
3. **Stale file detection** -- compares output files against generated Map keys

The internal type files (`agent.types.ts`, `agent.schemas.ts`, etc.) are never referenced by drift detection. Renaming, merging, or deleting them has zero effect on drift detection.

#### lu-workflow Rule Move Impact

Moving `lu-workflow.rule.ts` from `src/rules/` to `src/rules/general/` will cause it to appear in the registry completeness scan (lines 180-191 of `check-drift.test.ts`). Since `"lu-workflow"` is already a key in `ruleRegistry`, the completeness test will pass. **This is a benefit**: the rule will now be covered by the completeness check that currently skips it.
