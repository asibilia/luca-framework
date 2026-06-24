# Plan 55.1 Summary: Investigation -- Resolve All Unknowns

**Wave:** 1 (read-only)
**Status:** Complete
**Date:** 2026-02-26

## Findings Per Unknown

### U1: AgentFrontmatter Consumer Map

**Finding:** All three entity type systems (agent, skill, rule) share an identical dual-layer pattern:

- `.types.ts` files define hand-written interfaces AND re-export Zod-inferred types from `.schemas.ts`
- `.schemas.ts` files define Zod schemas and export `z.infer<>` types
- The hand-written interfaces are structurally identical to the Zod-inferred types -- they exist in parallel without any divergence

**Consumer counts:**

- **Agent:** 30+ files import from `agent.types.ts`, only 3 import directly from `agent.schemas.ts`
- **Skill:** 40+ files import from `skill.types.ts`, only 3 import directly from `skill.schemas.ts`
- **Rule:** 25+ files import from `rule.types.ts`, only 3 import directly from `rule.schemas.ts`

**Key insight for Wave 3:** The massive consumer asymmetry (95%+ import from `.types.ts`) means the lowest-churn approach is to keep `.types.ts` as a thin barrel re-export from `.schemas.ts` rather than deleting `.types.ts` and repointing 95+ consumers.

### U2: Test Import Audit

**Finding:** 19 import statements across 10 unique test files need updating, distributed across waves:

| Wave                       | Files                  | Imports |
| -------------------------- | ---------------------- | ------- |
| Wave 2 (schema renames)    | 1 file (`fixtures.ts`) | 3       |
| Wave 3 (type file changes) | 7 files                | 10      |
| Wave 4 (harness types)     | 5 files                | 6       |

**No test files import from:**

- `profile.types.ts` (no direct consumers)
- `complexity/types.ts` (consumed via re-exports)
- `lu-workflow.rule.ts` (no test imports)

**Surprise:** `__tests__/src/memory/quality-scorer.test.ts:7` imports `HarnessResult` and `CheckResult` from `../../../src/harness/types.ts` -- this was not listed in the plan's "Known affected test files" section. It needs to be included in Wave 4 planning.

### U3: lu-workflow.rule.ts Placement

**Finding:** The move from `src/rules/` to `src/rules/general/` is purely mechanical with zero functional impact.

**Required changes:**

1. `git mv src/rules/lu-workflow.rule.ts src/rules/general/lu-workflow.rule.ts`
2. Update import in `src/rules/index.ts` (line 26): `"./lu-workflow.rule"` -> `"./general/lu-workflow.rule"`
3. Update re-export in `index.ts` (line 60): `"./src/rules/lu-workflow.rule"` -> `"./src/rules/general/lu-workflow.rule"`
4. Update internal imports in the rule file itself: `"./types/rule.types"` -> `"../types/rule.types"` and `"./base/base-rule"` -> `"../base/base-rule"`

**Bonus:** After the move, `lu-workflow.rule.ts` will be automatically included in the registry completeness scan (`check-drift.test.ts` lines 180-191), which currently skips it because it is not in `src/rules/general/`.

### U4: Harness Config Loading

**Finding:** The unsafe cast is at `src/harness/runner.ts` line 24: `return raw.harness as HarnessConfig;`

**What is missing:**

1. No Zod schema for `HarnessConfig` (only a hand-written interface in `types.ts`)
2. No `safeParse` or `parse` validation
3. No prototype pollution protection (`Bun.file().json()` used instead of `sanitizeJsonParse`)
4. No partial/default merging -- if `raw.harness` exists but is incomplete, undefined fields are silently passed through

**Migration path for Wave 4:**

1. Create `src/harness/schemas.ts` with Zod schemas for `CheckConfig` and `HarnessConfig`
2. Replace the `as HarnessConfig` cast with `harnessConfigSchema.parse()` or `.safeParse()` with fallback
3. Add `sanitizeJsonParse` for prototype pollution protection
4. Optionally derive `DEFAULT_HARNESS_CONFIG` from the schema defaults

### U5: Drift Detection Paths

**Finding:** Drift detection operates entirely on registry keys and output paths, never on internal type file paths.

**Output directories validated:**

- IDE outputs: `.claude/agents/`, `.cursor/agents/`, `.claude/skills/`, `.cursor/skills/`, `.claude/rules/`, `.cursor/rules/`, `.claude/hooks/`, `.cursor/hooks/`
- Plugin outputs: `dist/plugin/agents/`, `dist/plugin/skills/`, `dist/plugin/commands/`, `dist/plugin/scripts/`, `dist/plugin/hooks/`, `dist/plugin/.claude-plugin/`
- Stale detection: `.claude/rules/` (`.md`), `.cursor/rules/` (`.mdc`)

**Confirmed:** Internal type file renames (`.types.ts`, `.schemas.ts`) have zero effect on drift detection. The completeness checks scan entity files (`*.agent.ts`, `*.skill.ts`, `*.rule.ts`) not type files.

## Key Takeaways for Waves 2-4

1. **Wave 2 (lu-workflow move):** Purely mechanical, 4 file changes. No test files affected. Gains completeness check coverage as a bonus.

2. **Wave 3 (type consolidation):** The recommended approach is to keep `.types.ts` as a thin barrel re-export from `.schemas.ts`, deleting only the hand-written interface definitions. This minimizes consumer churn to near-zero because the import paths stay the same. If `.types.ts` is fully deleted instead, 95+ source files and 10 test imports need repointing.

3. **Wave 4 (harness Zod migration):** The harness config loading has a clear unsafe cast and missing validation. The migration is straightforward: create `schemas.ts`, replace the cast with `parse()`. 5 test files (6 import statements) need updating.

4. **Missing from plan:** `__tests__/src/memory/quality-scorer.test.ts` was not listed as an affected test file for Wave 4 but imports `HarnessResult` and `CheckResult` from `src/harness/types.ts`.

5. **No surprises with drift detection.** Type file renames are completely invisible to the build pipeline and drift detection system.
