# Phase 24 Research: Build Pipeline Consolidation

**Researcher:** lu-phase-researcher
**Date:** 2026-02-12
**Phase:** 24 — Build Pipeline Consolidation
**Goal:** Extract shared compilation pipeline to eliminate triple duplication across build-all.ts, check-drift.ts, and check-drift.test.ts

---

## 1. Current State Analysis

### Files Under Scope

| File                          | Lines | Purpose                                                                                                     |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------------------- |
| `scripts/build-all.ts`        | 766   | Unified build: compiles all entities to .cursor/, .claude/, dist/plugin/                                    |
| `scripts/check-drift.ts`      | 426   | Drift detection: generates in-memory, compares to committed files                                           |
| `scripts/check-drift.test.ts` | 778   | Test suite: validates output freshness, registry completeness, orphan detection                             |
| `scripts/build-shared.ts`     | 363   | Shared constants: PLUGIN_EXCLUDED_HOOKS, categories, generatePluginHooksConfig, readVersion, generateReadme |
| `scripts/build-utils.ts`      | 86    | File cleanup utilities: cleanDirectory, cleanSkillsDirectory, ensureDir                                     |
| `src/hooks/index.ts`          | 192   | Hook registry + generateHooksConfig + generateCursorHooksConfig                                             |

### What Is Already Shared (via build-shared.ts)

Extracted in Phase 22:

- `PLUGIN_EXCLUDED_HOOKS` — Set of hooks excluded from plugin builds
- `SKILL_CATEGORIES` / `AGENT_CATEGORIES` — Category maps for README generation
- `generatePluginHooksConfig()` — Plugin hooks.json builder
- `readVersion()` — Package version reader
- `generateReadme()` — Plugin README.md builder

### What Is Still Duplicated

The core compilation pipeline (instantiate compilers, iterate registries, compile each entity, compile Luca-specific entities) is duplicated **three times**:

1. **build-all.ts** lines 55-245 (agents/skills/rules for Cursor+Claude) + lines 369-665 (plugin)
2. **check-drift.ts** lines 52-314 (`generateToTemp()` function)
3. **check-drift.test.ts** lines 50-134 (`generateExpected()` function) + lines 440-713 (plugin freshness tests)

---

## 2. Requirement-by-Requirement Analysis

### DEDUP-01: Extract `generateAllOutputs(): Map<string, string>`

**Current duplication locations:**

The "generate all content in-memory" pipeline exists in three places:

#### check-drift.ts `generateToTemp()` (lines 52-315)

- Creates `CursorCompiler`, `ClaudeCompiler`, `PluginCompiler`
- Iterates `agentRegistry`, `skillRegistry`, `ruleRegistry` for Cursor+Claude
- Instantiates Luca-specific entities (`LuExecutorAgent`, `LuPlannerAgent`, `LuSkill`, `LuWorkflowRule`)
- Compiles all entities to a `Map<string, string>`
- Also generates plugin agents, skills, commands, hooks, manifests, README

#### check-drift.test.ts `generateExpected()` (lines 50-135)

- Same pattern but ONLY for Cursor+Claude outputs (no plugin)
- Used by "Output Freshness" tests
- Plugin freshness tests (lines 440-713) re-instantiate everything inline

#### build-all.ts `main()` (lines 54-745)

- Same compilation logic but writes to disk instead of Map
- Has additional concerns: directory creation, cleaning, console output, error tracking

**Key differences between the three implementations:**

| Aspect               | build-all.ts                       | check-drift.ts                  | check-drift.test.ts             |
| -------------------- | ---------------------------------- | ------------------------------- | ------------------------------- |
| Output target        | Disk (Bun.write)                   | Map<string, string>             | Map + inline assertions         |
| Error handling       | try/catch per registry entity      | None (throws)                   | None (throws)                   |
| Plugin output        | Yes                                | Yes                             | Yes (separate tests)            |
| Hook scripts         | Copies files + chmod               | Reads to Map                    | Reads + compares inline         |
| Settings/config      | Merges with existing settings.json | Generates hooks-only key        | Generates + compares            |
| Marketplace manifest | Inline object literal              | Inline object literal           | Inline object literal           |
| Plugin manifest      | `generatePluginManifest()` call    | `generatePluginManifest()` call | `generatePluginManifest()` call |
| README               | `generateReadme()` call            | `generateReadme()` call         | `generateReadme()` call         |

**Recommended approach:**

Extract a `generateAllOutputs(): Promise<Map<string, string>>` function to `build-shared.ts`. This function:

1. Instantiates all three compilers
2. Iterates all registries + Luca-specific entities
3. Generates all Cursor, Claude, and plugin content
4. Returns a `Map<string, string>` mapping relative paths to content

Then:

- `check-drift.ts` calls `generateAllOutputs()` directly (replacing `generateToTemp()`)
- `check-drift.test.ts` calls `generateAllOutputs()` (replacing `generateExpected()` + inline plugin generation)
- `build-all.ts` calls `generateAllOutputs()` to get the Map, then iterates to write files to disk

**Shared compilation code that would be deduplicated:**

```
Agents (registry loop + 2 Luca-specific): ~30 lines x 3 = ~90 lines
Skills (registry loop + 1 Luca-specific): ~20 lines x 3 = ~60 lines
Rules (registry loop + 1 Luca-specific): ~20 lines x 3 = ~60 lines
Plugin agents/skills/commands: ~40 lines x 2 = ~80 lines (check-drift.ts + check-drift.test.ts)
Total savings: ~290 lines of duplicated compilation logic
```

---

### DEDUP-02: Extract `generateMarketplaceManifest(version): object`

**Current duplication:** The marketplace manifest object literal appears in 3 files:

#### build-all.ts (lines 636-659)

```typescript
const marketplaceManifest = {
  $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
  name: "luca-marketplace",
  owner: { name: "Alec Sibilia" },
  plugins: [
    {
      name: "luca",
      description:
        "Agentic development framework with cognitive memory and spec-driven workflow",
      source: ".",
      category: "development",
      version,
      author: { name: "Alec Sibilia" },
      homepage: "https://github.com/alecsibilia/luca-framework",
      repository: "https://github.com/alecsibilia/luca-framework",
      license: "MIT",
      keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
    },
  ],
};
```

#### check-drift.ts (lines 276-299)

Identical object literal.

#### check-drift.test.ts (lines 648-678)

Identical object literal.

**Recommended approach:**

Add to `build-shared.ts`:

```typescript
export function generateMarketplaceManifest(version: string): object {
  return {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "luca-marketplace",
    owner: { name: "Alec Sibilia" },
    plugins: [
      {
        name: "luca",
        description:
          "Agentic development framework with cognitive memory and spec-driven workflow",
        source: ".",
        category: "development",
        version,
        author: { name: "Alec Sibilia" },
        homepage: "https://github.com/alecsibilia/luca-framework",
        repository: "https://github.com/alecsibilia/luca-framework",
        license: "MIT",
        keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
      },
    ],
  };
}
```

Note: If DEDUP-01 is implemented fully (with `generateAllOutputs()` producing the marketplace JSON as part of the Map), this function may only need to be called from `generateAllOutputs()` itself. But it is still worth extracting as a named function for clarity and testability.

---

### DEDUP-03: Remove Unused `tempDir` Parameter

**Location:** `scripts/check-drift.ts` line 52

```typescript
async function generateToTemp(tempDir: string): Promise<Map<string, string>> {
```

**Evidence of non-use:** The `tempDir` parameter is declared but never referenced anywhere within the function body (lines 52-315). The function generates everything in-memory into a `Map<string, string>` — it never writes to `tempDir`.

**Call site:** Line 322:

```typescript
const generated = await generateToTemp("");
```

An empty string is passed, confirming it is vestigial. This was likely left over from an earlier implementation that wrote to a temporary directory on disk.

**Recommended approach:** Simply remove the parameter from the function signature and the argument from the call site. If DEDUP-01 is implemented, this function is replaced entirely, making DEDUP-03 moot.

---

### DEDUP-04: Deduplicate `generatePluginHooksConfig()` and `generateHooksConfig()`

**File 1:** `src/hooks/index.ts` lines 117-155 — `generateHooksConfig()`
**File 2:** `scripts/build-shared.ts` lines 144-182 — `generatePluginHooksConfig()`

#### Side-by-side diff:

| Line             | `generateHooksConfig()` (src/hooks/index.ts)        | `generatePluginHooksConfig()` (build-shared.ts)            |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| Param            | `registry: Record<string, HookDefinition>`          | `registry: Record<string, HookDefinition>`                 |
| Return           | `Record<string, unknown>` (bare events object)      | `Record<string, unknown>` (wrapped in `{ hooks: events }`) |
| Local var        | `config`                                            | `events`                                                   |
| Matcher sentinel | `"__no_matcher__"`                                  | `"__no_matcher__"`                                         |
| Group matching   | Identical logic                                     | Identical logic                                            |
| Group creation   | Identical logic                                     | Identical logic                                            |
| **Command path** | `"$CLAUDE_PROJECT_DIR"/.claude/hooks/${def.script}` | `${CLAUDE_PLUGIN_ROOT}/scripts/${def.script}`              |
| Async handling   | Identical                                           | Identical                                                  |
| StatusMessage    | Identical                                           | Identical                                                  |

**Exact differences:**

1. **Command path template** — the only functional difference
2. **Return wrapping** — `generateHooksConfig()` returns the events object directly; `generatePluginHooksConfig()` wraps it in `{ hooks: events }`

Note: The caller of `generateHooksConfig()` in `build-all.ts` (line 308) assigns the result to `existingSettings.hooks`, so the bare return is correct. The caller of `generatePluginHooksConfig()` writes `{ hooks: events }` as the entire file content.

**Recommended approach:**

Create a single parameterized function:

```typescript
export function generateClaudeHooksConfig(
  registry: Record<string, HookDefinition>,
  options: {
    commandPrefix: string; // e.g., '"$CLAUDE_PROJECT_DIR"/.claude/hooks' or '${CLAUDE_PLUGIN_ROOT}/scripts'
    wrapInHooksKey?: boolean; // true for plugin (returns { hooks: {...} }), false for settings.json
  },
): Record<string, unknown>;
```

This replaces both functions. Callers update to:

- `build-all.ts`: `generateClaudeHooksConfig(hookRegistry, { commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks' })`
- `build-all.ts` (plugin): `generateClaudeHooksConfig(pluginHookRegistry, { commandPrefix: '${CLAUDE_PLUGIN_ROOT}/scripts', wrapInHooksKey: true })`

`generateCursorHooksConfig()` stays separate since it has a fundamentally different structure (flat arrays, no matcher grouping, different event names).

---

### CLEAN-03: Add try/catch for Luca-specific Entity Compilation

**Location:** `scripts/build-all.ts`

The registry loops (lines 115-136, 166-189, 211-232) all have try/catch with proper error tracking via `failures.push()`. However, the Luca-specific entities for Cursor+Claude lack try/catch:

| Entity                            | Lines   | Has try/catch? |
| --------------------------------- | ------- | -------------- |
| Registry agents loop              | 115-136 | Yes            |
| `LuExecutorAgent` (Cursor+Claude) | 138-149 | **NO**         |
| `LuPlannerAgent` (Cursor+Claude)  | 151-161 | **NO**         |
| Registry skills loop              | 166-189 | Yes            |
| `LuSkill` (Cursor+Claude)         | 192-206 | **NO**         |
| Registry rules loop               | 211-232 | Yes            |
| `LuWorkflowRule` (Cursor+Claude)  | 235-245 | **NO**         |
| Plugin `LuExecutorAgent`          | 446-458 | Yes            |
| Plugin `LuPlannerAgent`           | 460-472 | Yes            |
| Plugin `LuSkill`                  | 499-513 | Yes            |
| Plugin `lu` command               | 541-550 | Yes            |

The inconsistency: the Plugin section (lines 446-550) wraps Luca-specific entities in try/catch, but the Cursor+Claude section (lines 138-245) does not. Four Luca-specific entity compilations in the Cursor+Claude section lack error handling.

**Recommended approach:**

Wrap each of the four Luca-specific entity blocks (lines 138-149, 151-161, 192-206, 235-245) in try/catch matching the pattern used by the plugin section. If DEDUP-01 is implemented (single `generateAllOutputs()`), the compilation logic centralizes and this becomes moot -- the single pipeline should have uniform error handling.

---

### CLEAN-04: Replace Magic String Sentinels

**Occurrences of `"__no_matcher__"`:**

| File                      | Lines    | Context                       |
| ------------------------- | -------- | ----------------------------- |
| `src/hooks/index.ts`      | 131, 133 | `generateHooksConfig()`       |
| `scripts/build-shared.ts` | 158, 160 | `generatePluginHooksConfig()` |

Both use the identical pattern:

```typescript
const matcherKey = def.matcher ?? "__no_matcher__";
let group = config[def.event].find((g) => {
  if (matcherKey === "__no_matcher__") return !g.matcher;
  return g.matcher === def.matcher;
});
```

**Other magic strings found (also candidates for named constants):**

| String                                                    | Files                                                  | Lines              | Count |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------------ | ----- |
| `COMMAND_EXCLUDED_PREFIXES = ["rule-", "workflow-start"]` | build-all.ts, check-drift.ts, check-drift.test.ts (x2) | 520, 209, 534, 757 | 4     |

**Recommended approach:**

1. Add to `src/hooks/index.ts` (or `build-shared.ts`):

```typescript
/** Sentinel value for hooks with no matcher constraint. */
const NO_MATCHER_SENTINEL = "__no_matcher__" as const;
```

2. Add to `build-shared.ts`:

```typescript
/**
 * Skill name prefixes excluded from plugin command generation.
 * These skills are internal/reference and not user-invocable.
 */
export const COMMAND_EXCLUDED_PREFIXES: readonly string[] = [
  "rule-",
  "workflow-start",
];
```

If DEDUP-04 is implemented (single hook config generator), the `NO_MATCHER_SENTINEL` only needs to exist in one place. If DEDUP-01 is implemented, `COMMAND_EXCLUDED_PREFIXES` only needs to exist in `build-shared.ts`.

---

## 3. Hook Config Diff Analysis

### Full comparison of the three hook config generators:

| Property             | `generateHooksConfig`                  | `generatePluginHooksConfig`           | `generateCursorHooksConfig`                 |
| -------------------- | -------------------------------------- | ------------------------------------- | ------------------------------------------- |
| **File**             | src/hooks/index.ts                     | scripts/build-shared.ts               | src/hooks/index.ts                          |
| **Lines**            | 117-155                                | 144-182                               | 167-191                                     |
| **Event field**      | `def.event`                            | `def.event`                           | `def.cursorEvent`                           |
| **Grouping**         | By matcher (array of groups)           | By matcher (array of groups)          | Flat array per event                        |
| **Matcher handling** | `__no_matcher__` sentinel              | `__no_matcher__` sentinel             | `def.cursorMatcher` (inline)                |
| **Command template** | `"$CLAUDE_PROJECT_DIR"/.claude/hooks/` | `${CLAUDE_PLUGIN_ROOT}/scripts/`      | `.cursor/hooks/`                            |
| **Async support**    | Yes                                    | Yes                                   | No                                          |
| **StatusMessage**    | Yes                                    | Yes                                   | No                                          |
| **Return shape**     | `{ [event]: [...groups] }`             | `{ hooks: { [event]: [...groups] } }` | `{ version: 1, hooks: { [event]: [...] } }` |

**Conclusion:** `generateHooksConfig` and `generatePluginHooksConfig` share ~90% identical logic. `generateCursorHooksConfig` is structurally different (flat arrays, different event names, no matcher grouping, no async/statusMessage) and should remain separate.

---

## 4. Magic String Inventory

| Magic String                  | Occurrences                      | Files                                                  | Recommended Constant Name   |
| ----------------------------- | -------------------------------- | ------------------------------------------------------ | --------------------------- |
| `"__no_matcher__"`            | 4 (2 per function x 2 functions) | src/hooks/index.ts, scripts/build-shared.ts            | `NO_MATCHER_SENTINEL`       |
| `["rule-", "workflow-start"]` | 4 definitions                    | build-all.ts, check-drift.ts, check-drift.test.ts (x2) | `COMMAND_EXCLUDED_PREFIXES` |

---

## 5. Import Graph

### Current Import Graph (Before)

```
build-all.ts
  <- src/agents/index (agentRegistry)
  <- src/skills/index (skillRegistry)
  <- src/rules/index (ruleRegistry)
  <- src/hooks/index (hookRegistry, generateHooksConfig, generateCursorHooksConfig)
  <- src/agents/types/agent.types (BaseAgent)
  <- src/skills/types/skill.types (BaseSkill)
  <- src/rules/types/rule.types (BaseRule)
  <- src/agents/luca/lu-executor.agent (LuExecutorAgent)
  <- src/agents/luca/lu-planner.agent (LuPlannerAgent)
  <- src/skills/luca/lu.skill (LuSkill)
  <- src/rules/lu-workflow.rule (LuWorkflowRule)
  <- src/compilers/cursor.compiler (CursorCompiler)
  <- src/compilers/claude.compiler (ClaudeCompiler)
  <- src/compilers/plugin.compiler (PluginCompiler)
  <- src/compilers/plugin.types (generatePluginManifest)
  <- scripts/build-utils (cleanDirectory, cleanSkillsDirectory, ensureDir)
  <- scripts/build-shared (PLUGIN_EXCLUDED_HOOKS, generatePluginHooksConfig, readVersion, generateReadme)

check-drift.ts
  <- src/agents/index (agentRegistry)
  <- src/skills/index (skillRegistry)
  <- src/rules/index (ruleRegistry)
  <- src/hooks/index (hookRegistry, generateHooksConfig, generateCursorHooksConfig)
  <- src/agents/types/agent.types (BaseAgent)
  <- src/skills/types/skill.types (BaseSkill)
  <- src/rules/types/rule.types (BaseRule)
  <- src/agents/luca/lu-executor.agent (LuExecutorAgent)
  <- src/agents/luca/lu-planner.agent (LuPlannerAgent)
  <- src/skills/luca/lu.skill (LuSkill)
  <- src/rules/lu-workflow.rule (LuWorkflowRule)
  <- src/compilers/cursor.compiler (CursorCompiler)
  <- src/compilers/claude.compiler (ClaudeCompiler)
  <- src/compilers/plugin.compiler (PluginCompiler)
  <- src/compilers/plugin.types (generatePluginManifest)
  <- scripts/build-shared (PLUGIN_EXCLUDED_HOOKS, generatePluginHooksConfig, readVersion, generateReadme)

check-drift.test.ts
  <- src/agents/index (agentRegistry)
  <- src/skills/index (skillRegistry)
  <- src/rules/index (ruleRegistry)
  <- src/hooks/index (hookRegistry, generateHooksConfig, generateCursorHooksConfig)
  <- src/agents/types/agent.types (BaseAgent)
  <- src/skills/types/skill.types (BaseSkill)
  <- src/rules/types/rule.types (BaseRule)
  <- src/agents/luca/lu-executor.agent (LuExecutorAgent)
  <- src/agents/luca/lu-planner.agent (LuPlannerAgent)
  <- src/skills/luca/lu.skill (LuSkill)
  <- src/rules/lu-workflow.rule (LuWorkflowRule)
  <- src/compilers/cursor.compiler (CursorCompiler)
  <- src/compilers/claude.compiler (ClaudeCompiler)
  <- src/compilers/plugin.compiler (PluginCompiler)
  <- src/compilers/plugin.types (generatePluginManifest)
  <- scripts/build-shared (PLUGIN_EXCLUDED_HOOKS, generatePluginHooksConfig, readVersion, generateReadme)

build-shared.ts
  <- src/hooks/index (HookDefinition type only)
```

**Observation:** All three consumer files import the exact same set of 16 modules. This is the clearest signal that the compilation logic should be centralized.

### Proposed Import Graph (After)

```
build-shared.ts (expanded)
  <- src/agents/index (agentRegistry)
  <- src/skills/index (skillRegistry)
  <- src/rules/index (ruleRegistry)
  <- src/hooks/index (hookRegistry, generateCursorHooksConfig, HookDefinition)
  <- src/agents/types/agent.types (BaseAgent)
  <- src/skills/types/skill.types (BaseSkill)
  <- src/rules/types/rule.types (BaseRule)
  <- src/agents/luca/lu-executor.agent (LuExecutorAgent)
  <- src/agents/luca/lu-planner.agent (LuPlannerAgent)
  <- src/skills/luca/lu.skill (LuSkill)
  <- src/rules/lu-workflow.rule (LuWorkflowRule)
  <- src/compilers/cursor.compiler (CursorCompiler)
  <- src/compilers/claude.compiler (ClaudeCompiler)
  <- src/compilers/plugin.compiler (PluginCompiler)
  <- src/compilers/plugin.types (generatePluginManifest)

build-all.ts (simplified)
  <- scripts/build-shared (generateAllOutputs)
  <- scripts/build-utils (cleanDirectory, cleanSkillsDirectory, ensureDir)
  <- src/hooks/index (hookRegistry — still needed for hook script copying + settings.json merge)

check-drift.ts (simplified)
  <- scripts/build-shared (generateAllOutputs)

check-drift.test.ts (simplified)
  <- scripts/build-shared (generateAllOutputs)
  <- src/agents/index (agentRegistry — still needed for orphan detection)
  <- src/skills/index (skillRegistry — still needed for orphan detection)
  <- src/rules/index (ruleRegistry — still needed for orphan detection)
  <- src/hooks/index (hookRegistry — still needed for orphan detection + hook freshness)
```

**Import reduction:**

- `check-drift.ts`: 16 imports -> 1 import (build-shared)
- `check-drift.test.ts`: 16 imports -> 5 imports (build-shared + registries for orphan detection)
- `build-all.ts`: 16 imports -> 3 imports (build-shared + build-utils + hookRegistry for script copying)

---

## 6. Recommended Implementation Approach

### Execution Order

The requirements have natural dependencies:

```
DEDUP-04 (unify hook config generators) ---\
DEDUP-02 (extract marketplace manifest) ----+---> DEDUP-01 (extract generateAllOutputs)
CLEAN-04 (replace magic strings) ----------/          |
DEDUP-03 (remove tempDir) ----> subsumed by DEDUP-01  |
CLEAN-03 (add try/catch) ----> subsumed by DEDUP-01 --/
```

**Recommended wave structure:**

**Wave 1:** DEDUP-04 + CLEAN-04 + DEDUP-02

- Unify `generateHooksConfig` and `generatePluginHooksConfig` into a single parameterized function in `build-shared.ts`
- Replace `"__no_matcher__"` with `NO_MATCHER_SENTINEL` constant
- Extract `COMMAND_EXCLUDED_PREFIXES` to `build-shared.ts`
- Extract `generateMarketplaceManifest(version)` to `build-shared.ts`

**Wave 2:** DEDUP-01 + DEDUP-03 + CLEAN-03

- Extract `generateAllOutputs(): Promise<Map<string, string>>` to `build-shared.ts`
  - This inherently removes the unused `tempDir` parameter (DEDUP-03)
  - This inherently adds uniform error handling (CLEAN-03, as a design choice for the new function)
- Update `check-drift.ts` to use `generateAllOutputs()`
- Update `check-drift.test.ts` to use `generateAllOutputs()`
- Update `build-all.ts` to use `generateAllOutputs()` for content generation, keeping only the disk-writing logic

### Key Design Decision: Error Handling in `generateAllOutputs()`

Two options:

**Option A: Throw on failure (current check-drift/test behavior)**

- `generateAllOutputs()` throws if any compilation fails
- `build-all.ts` wraps call in try/catch for graceful degradation
- Simpler API

**Option B: Return errors alongside outputs (current build-all.ts behavior)**

- Return `{ outputs: Map<string, string>, failures: Array<{type, name, error}> }`
- Callers decide how to handle failures
- More flexible but more complex

**Recommendation:** Option A (throw on failure). The compilation should either succeed completely or fail fast. `build-all.ts` can catch and report. This is simpler and matches the existing check-drift/test behavior.

### Special Handling: build-all.ts Concerns Beyond Compilation

`build-all.ts` has concerns that `generateAllOutputs()` should NOT absorb:

1. **Directory creation/cleaning** (lines 58-105) — filesystem side effect
2. **Hook script file copying** (lines 260-358) — filesystem side effect
3. **chmod +x** for hook scripts — filesystem side effect
4. **settings.json merge** (lines 294-314) — reads existing settings, merges hooks key
5. **Console output / progress logging** — UI concern
6. **Failure tracking and reporting** (lines 107-110, 738-744) — reporting concern

These remain in `build-all.ts`. The function only replaces the in-memory content generation.

---

## 7. Risk Assessment

| Risk                                              | Severity | Mitigation                                                                                                                                                                                                  |
| ------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build output changes (content drift)              | HIGH     | Run `bun run check:drift` after every change. The existing drift detection infra is the safety net.                                                                                                         |
| Breaking check-drift.test.ts (false negatives)    | MEDIUM   | Run `bun test scripts/check-drift.test.ts` after refactoring. Tests themselves verify they catch drift.                                                                                                     |
| Import cycle introduction                         | LOW      | `build-shared.ts` already imports from `src/hooks/index.ts`. Adding more src/ imports follows the same direction (scripts/ -> src/). No risk of cycles.                                                     |
| Hook config behavioral change                     | MEDIUM   | The parameterized function must produce byte-identical JSON output for both paths. Verify by comparing `generateHooksConfig` output before/after and `generatePluginHooksConfig` output before/after.       |
| `generateCursorHooksConfig` accidentally affected | LOW      | This function is structurally different and stays in `src/hooks/index.ts`. It is not part of DEDUP-04.                                                                                                      |
| Marketplace manifest field drift                  | LOW      | Extracting to a single function eliminates the risk of future drift between the 3 copies.                                                                                                                   |
| Plugin spec test breakage                         | MEDIUM   | `plugin-spec-structure.test.ts` and `plugin-spec-e2e.test.ts` read committed output files. They are not affected by build-shared changes since they only read dist/plugin/. Run full test suite to confirm. |

### Verification Strategy

1. **Before any changes:** Run `bun run build:all && bun run check:drift && bun test` to establish baseline
2. **After Wave 1:** Run drift check + tests to verify hook config and marketplace manifest are byte-identical
3. **After Wave 2:** Run full suite. The `generateAllOutputs()` Map should produce identical keys and values to the current implementations
4. **Final:** `git diff` on committed output files should show zero changes

---

## 8. Additional Duplicated Constants (Bonus Findings)

Beyond the requirements, these constants are also duplicated and could be consolidated:

| Constant                                                                       | Occurrences                                                                            | Recommendation                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Plugin manifest metadata (`name: "luca"`, `description`, `author`, `keywords`) | build-all.ts L617-626, check-drift.ts L261-268, check-drift.test.ts L623-630           | Already partially addressed by DEDUP-01 (pipeline centralizes the call). Could also extract a `PLUGIN_METADATA` constant. |
| `LUCA_SPECIFIC_AGENTS/SKILLS/RULES` sets                                       | check-drift.test.ts L274-279                                                           | These are test-only and correctly scoped. No action needed.                                                               |
| `isCommandSkill()` helper                                                      | build-all.ts L522-523, check-drift.ts L210-211, check-drift.test.ts L535-536, L758-759 | Extract to build-shared.ts alongside `COMMAND_EXCLUDED_PREFIXES`.                                                         |

---

_Research completed: 2026-02-12_
