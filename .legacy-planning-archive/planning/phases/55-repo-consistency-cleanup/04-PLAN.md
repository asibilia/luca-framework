---
id: "55.4"
title: "New Zod Schemas + Remaining Cleanup"
wave: 4
depends_on: ["55.3"]
tasks:
  - id: "55.4.1"
    title: "Migrate harness/types.ts to Zod schemas"
    files:
      [
        "src/harness/types.ts",
        "src/harness/runner.ts",
        "src/harness/index.ts",
        "src/harness/parsers/index.ts",
      ]
    verify: "All 6 interfaces replaced with Zod schemas + z.infer types, runner uses safeParse for config loading"
  - id: "55.4.2"
    title: "Migrate complexity/types.ts to Zod schemas"
    files:
      [
        "src/complexity/types.ts",
        "src/complexity/defaults.ts",
        "src/complexity/index.ts",
      ]
    verify: "All interfaces replaced with Zod schemas, ComplexityClassification and ComplexityGate are Zod-derived"
  - id: "55.4.3"
    title: "Convert HookDefinition interface to Zod schema"
    files: ["src/hooks/index.ts"]
    verify: "HookDefinition is Zod-derived, hookRegistry entries validated"
  - id: "55.4.4"
    title: "Standardize harness config loading with safeParse"
    files: ["src/harness/runner.ts"]
    verify: "loadHarnessConfig uses Zod safeParse instead of unsafe 'as' cast"
  - id: "55.4.5"
    title: "Standardize registries to thunks"
    files: ["src/hooks/index.ts", "src/harness/parsers/index.ts"]
    verify: "All registries use () => value pattern consistently"
  - id: "55.4.6"
    title: "Audit and replace any remaining Object.freeze with deepFreeze"
    files: ["src/"]
    verify: "No Object.freeze calls remain in src/ (except inside deep-freeze.ts itself)"
  - id: "55.4.7"
    title: "Delete stale comments"
    files: ["src/"]
    verify: "No comments referencing old patterns, classes, or incorrect implementations remain"
  - id: "55.4.8"
    title: "Final safeParse/parse audit"
    files: ["src/"]
    verify: "safeParse at system boundaries, parse for internal trusted data, no unguarded parse at boundaries"
  - id: "55.4.9"
    title: "Update test files for harness and complexity migrations"
    files:
      [
        "__tests__/src/harness/config.test.ts",
        "__tests__/src/harness/runner.test.ts",
        "__tests__/src/complexity/types.test.ts",
        "__tests__/src/complexity/defaults.test.ts",
        "__tests__/src/iteration/convergence.test.ts",
        "__tests__/src/iteration/classifier.test.ts",
        "__tests__/src/hooks/hook-registry.test.ts",
      ]
    verify: "All tests pass with new Zod schema imports and types"
  - id: "55.4.10"
    title: "Run full build and test suite — final verification"
    files: []
    verify: "bun run build:all exits 0, bun test passes all tests, check:drift passes, zero tsc errors"
---

# Plan 55.4: New Zod Schemas + Remaining Cleanup

## Objective

Migrate the remaining hand-written interfaces (`harness/types.ts`, `complexity/types.ts`, `hooks/index.ts`) to Zod schemas, standardize registries, replace Object.freeze stragglers, delete stale comments, and perform the final safeParse/parse audit. After this wave, the entire `src/` directory is Zod-only for data shapes.

## Context

From 55-CONTEXT.md:

- Decision 3: Full Zod migration for `harness/types.ts` (6 interfaces) and `complexity/types.ts` (enums + interfaces)
- Decision 3: Replace all `Object.freeze()` with `deepFreeze` across the codebase
- Decision 3: Standardize `safeParse()` at system boundaries, `parse()` for internal trusted data
- Decision 6: Standardize all registries to thunks `() => instance`
- Decision 7: Delete stale comments referencing old patterns/classes
- Wave 4 is medium risk — more files than Wave 2 but less interconnected than Wave 3

## Tasks

### Task 55.4.1: Migrate harness/types.ts to Zod schemas

Convert all 6 interfaces in `src/harness/types.ts` to Zod schemas with `z.infer` types. This file defines the verification harness type system.

**Current interfaces to migrate:**

| Interface       | Description                                           |
| --------------- | ----------------------------------------------------- |
| `CheckConfig`   | Configuration for a single check                      |
| `HarnessConfig` | Top-level harness configuration                       |
| `ParsedError`   | A single parsed error from toolchain output           |
| `CheckResult`   | Result of running a single check                      |
| `HarnessResult` | Aggregate result of all checks                        |
| `OutputParser`  | Parser function signature (type alias, not interface) |

**Target Zod schemas (following naming convention from Wave 2):**

```typescript
import { z } from "zod";

export const CheckConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  enabled: z.boolean(),
  timeout: z.number().positive(),
  parser: z.string(),
});
export type CheckConfig = z.infer<typeof CheckConfigSchema>;

export const HarnessConfigSchema = z.object({
  enabled: z.boolean(),
  checks: z.array(CheckConfigSchema),
  maxFixIterations: z.number().int().positive(),
  failFast: z.boolean(),
});
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

export const ParsedErrorSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  message: z.string(),
  code: z.string().optional(),
  severity: z.enum(["error", "warning"]),
});
export type ParsedError = z.infer<typeof ParsedErrorSchema>;

export const CheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped", "timeout"]),
  exitCode: z.number().int(),
  errors: z.array(ParsedErrorSchema),
  warnings: z.array(ParsedErrorSchema),
  rawOutput: z.string(),
  duration: z.number().nonnegative(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const HarnessResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  checks: z.array(CheckResultSchema),
  totalErrors: z.number().int().nonnegative(),
  totalWarnings: z.number().int().nonnegative(),
  duration: z.number().nonnegative(),
  timestamp: z.string(),
});
export type HarnessResult = z.infer<typeof HarnessResultSchema>;

/** Parser function signature — not a Zod schema (functions are not serializable) */
export type OutputParser = (output: string) => ParsedError[];
```

**DEFAULT_HARNESS_CONFIG:** Update to use `HarnessConfigSchema.parse()` for self-validation:

```typescript
export const DEFAULT_HARNESS_CONFIG: HarnessConfig = HarnessConfigSchema.parse({
  enabled: true,
  maxFixIterations: 3,
  failFast: false,
  checks: [
    {
      name: "test",
      command: "bun test",
      enabled: true,
      timeout: 120,
      parser: "bun-test",
    },
    {
      name: "typecheck",
      command: "bunx --bun tsc --noEmit",
      enabled: true,
      timeout: 60,
      parser: "tsc",
    },
    {
      name: "lint",
      command: "bunx --bun eslint . --format json",
      enabled: false,
      timeout: 60,
      parser: "eslint",
    },
    {
      name: "build",
      command: "bun run build:all",
      enabled: false,
      timeout: 120,
      parser: "generic",
    },
  ],
});
```

**Files:**

- `src/harness/types.ts` (rewritten with Zod schemas)
- `src/harness/index.ts` (update exports if schema names changed)

**Verify:** `bunx --bun tsc --noEmit` passes, `bun test __tests__/src/harness/` passes.

### Task 55.4.2: Migrate complexity/types.ts to Zod schemas

Convert remaining hand-written interfaces in `src/complexity/types.ts` to Zod schemas. Some elements are already Zod-like (`as const` arrays with type derivation), but the interfaces need conversion.

**Current elements to migrate:**

| Element                    | Current Form        | Target                                                                 |
| -------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `COMPLEXITY_LEVELS`        | `as const` array    | Keep as-is (already good)                                              |
| `ComplexityLevel`          | `typeof` derivation | Keep as-is                                                             |
| `COMPLEXITY_ORDER`         | `Record` const      | Keep as-is                                                             |
| `ComplexityTier`           | Type literal union  | `z.enum(["lightweight", "standard", "thorough"])`                      |
| `COMPLEXITY_TIER`          | `Record` const      | Keep as-is                                                             |
| `ComplexityClassification` | Interface           | Zod schema                                                             |
| `VerificationMode`         | Type literal union  | `z.enum(["quick", "standard", "full", "full+human"])`                  |
| `StepActivation`           | Type literal union  | `z.enum(["skip", "optional", "run", "required", "required+thorough"])` |
| `ComplexityGate`           | Interface           | Zod schema                                                             |
| `ComplexityMatrix`         | Type alias          | `z.record` or keep as `Record<ComplexityLevel, ComplexityGate>`        |
| `ComplexityConfig`         | Interface           | Zod schema                                                             |

**Special considerations:**

- `ComplexityGate` references `CognitionTier` (from `agent.schemas.ts`) and `ContextTier` (from `context/types.ts`). The import path needs to change from `agent.types` to `agent.schemas` (done in Wave 3).
- The `Partial<Record<CognitionTier, CognitionTier>>` pattern for `cognitionPromotions` needs a Zod representation. Use `z.record(CognitionTierSchema, CognitionTierSchema).partial().optional()`.
- `meetsThreshold()` and `getTier()` utility functions stay as-is (they're pure functions, not types).

**Files:**

- `src/complexity/types.ts` (rewritten with Zod schemas)
- `src/complexity/defaults.ts` (verify types still align, may need `ComplexityGateSchema.parse()`)
- `src/complexity/index.ts` (update exports)

**Verify:** `bunx --bun tsc --noEmit` passes, `bun test __tests__/src/complexity/` passes.

### Task 55.4.3: Convert HookDefinition interface to Zod schema

The `HookDefinition` interface in `src/hooks/index.ts` is a hand-written interface. Convert to Zod.

**Current:**

```typescript
export interface HookDefinition {
  event: string;
  cursorEvent: string;
  matcher?: string;
  cursorMatcher?: string;
  script: string;
  timeout: number;
  async: boolean;
  statusMessage?: string;
}
```

**Target:**

```typescript
export const HookDefinitionSchema = z.object({
  event: z.string(),
  cursorEvent: z.string(),
  matcher: z.string().optional(),
  cursorMatcher: z.string().optional(),
  script: z.string(),
  timeout: z.number().positive(),
  async: z.boolean(),
  statusMessage: z.string().optional(),
});
export type HookDefinition = z.infer<typeof HookDefinitionSchema>;
```

**Files:**

- `src/hooks/index.ts` (convert interface to Zod schema)

**Verify:** `bunx --bun tsc --noEmit` passes.

### Task 55.4.4: Standardize harness config loading with safeParse

Replace the unsafe `as HarnessConfig` cast in `loadHarnessConfig()` with Zod `safeParse`.

**Current (unsafe):**

```typescript
if (raw.harness) {
  return raw.harness as HarnessConfig; // UNSAFE
}
```

**Target (safe):**

```typescript
if (raw.harness) {
  const result = HarnessConfigSchema.safeParse(raw.harness);
  if (result.success) {
    return result.data;
  }
  // Fall through to defaults if validation fails
}
```

This follows Decision 3: `safeParse()` at system boundaries (config.json loading is a system boundary).

**Files:**

- `src/harness/runner.ts` (update `loadHarnessConfig`)

**Verify:** `bun test __tests__/src/harness/config.test.ts` passes, `bun test __tests__/src/harness/runner.test.ts` passes.

### Task 55.4.5: Standardize registries to thunks

Per Decision 6, all registries should use the `() => value` thunk pattern. Currently:

| Registry          | File                           | Current Pattern            | Needs Change?        |
| ----------------- | ------------------------------ | -------------------------- | -------------------- |
| `agentRegistry`   | `src/agents/index.ts`          | `() => instance` thunks    | No (already correct) |
| `skillRegistry`   | `src/skills/index.ts`          | `() => instance` thunks    | No (already correct) |
| `ruleRegistry`    | `src/rules/index.ts`           | `() => instance` thunks    | No (already correct) |
| `hookRegistry`    | `src/hooks/index.ts`           | Plain objects (not thunks) | **Yes**              |
| `parserRegistry`  | `src/harness/parsers/index.ts` | Direct function references | **Yes**              |
| `profileRegistry` | `src/rules/profiles/index.ts`  | Plain objects (not thunks) | **Yes**              |

**hookRegistry migration:**

```typescript
// Current
export const hookRegistry: Record<string, HookDefinition> = {
  "post-edit-format": { event: "PostToolUse", ... },
  ...
};

// Target
export const hookRegistry: Record<string, () => HookDefinition> = {
  "post-edit-format": () => ({ event: "PostToolUse", ... }),
  ...
};
```

**CAUTION:** This changes the hookRegistry access pattern. All consumers that currently access `hookRegistry[name]` will need to change to `hookRegistry[name]()`. Affected consumers:

- `src/hooks/index.ts` — `generateClaudeHooksConfig()` and `generateCursorHooksConfig()` iterate over `Object.entries(registry)`
- `scripts/build-shared.ts` — imports and uses hookRegistry
- `__tests__/scripts/check-drift.test.ts` — uses hookRegistry
- `__tests__/src/hooks/hook-registry.test.ts` — tests hookRegistry

**parserRegistry migration:**

```typescript
// Current
export const parserRegistry: Record<string, OutputParser> = {
  'tsc': parseTscOutput,
  ...
};

// Target
export const parserRegistry: Record<string, () => OutputParser> = {
  'tsc': () => parseTscOutput,
  ...
};
```

**CAUTION for parserRegistry:** The consumer in `src/harness/runner.ts` line 93 does `const parser = parserRegistry[check.parser]` then calls `parser(combinedOutput)`. With thunks, this becomes `parserRegistry[check.parser]()(combinedOutput)`.

**profileRegistry migration:**

```typescript
// Current
export const profileRegistry: Record<string, TechStackProfile> = {
  typescript: typescriptProfile,
  ...
};

// Target
export const profileRegistry: Record<string, () => TechStackProfile> = {
  typescript: () => typescriptProfile,
  ...
};
```

**Files:**

- `src/hooks/index.ts` (wrap hookRegistry values in thunks, update internal consumers)
- `src/harness/parsers/index.ts` (wrap parserRegistry values in thunks)
- `src/harness/runner.ts` (update parserRegistry access to call thunk)
- `src/rules/profiles/index.ts` (wrap profileRegistry values in thunks)
- `src/rules/index.ts` (update profileRegistry access to call thunk)
- `scripts/build-shared.ts` (update lines ~495 and ~539-545 where `hookDef.script` / `def.script` are accessed directly — call `hookDef()` before accessing properties; also update `generateClaudeHooksConfig` and `generateCursorHooksConfig` function signatures to accept `Record<string, () => HookDefinition>`)
- Affected test files

**Verify:** `bun run build:all` passes, `bun test` passes all tests.

### Task 55.4.6: Audit and replace any remaining Object.freeze with deepFreeze

Search for any `Object.freeze()` calls outside `src/shared/deep-freeze.ts` and replace with `deepFreeze()`.

**Current state (from investigation):**

- `src/shared/deep-freeze.ts` — defines `deepFreeze()` which internally uses `Object.freeze()` (this is correct, keep as-is)
- No other `Object.freeze()` calls found in `src/` during initial scan

**Verification steps:**

1. Run: `grep -rn "Object\.freeze" src/ --include="*.ts" | grep -v deep-freeze.ts`
2. If any results found, replace with `import { deepFreeze } from "../shared/deep-freeze"; deepFreeze(obj)`
3. Also check `__tests__/`, `scripts/`, and `packages/` for `Object.freeze` usage

**Files:** Any files found with `Object.freeze` (currently expected: none beyond deep-freeze.ts)

**Verify:** `grep -rn "Object\.freeze" src/ --include="*.ts" | grep -v deep-freeze.ts | wc -l` returns 0.

### Task 55.4.7: Delete stale comments

Remove comments that reference old patterns, classes, or incorrect implementations. Per Decision 7, only delete stale comments -- do not add new documentation.

**Patterns to search for and remove:**

```bash
# References to old class hierarchy
grep -rn "BaseAgentImpl\|BaseSkillImpl\|BaseRuleImpl" src/ --include="*.ts"
grep -rn "BaseCompiler\|ClaudeCompiler\|CursorCompiler\|PluginCompiler" src/ --include="*.ts"

# References to old patterns
grep -rn "abstract class\|extends Base" src/ --include="*.ts"

# "TODO" comments that reference completed work
grep -rn "TODO.*class\|TODO.*interface\|FIXME.*types" src/ --include="*.ts"

# Comments about backward compatibility that is now removed
grep -rn "backward.compat\|back.compat\|legacy.*alias" src/ --include="*.ts"
```

**Known stale comments from scan:**

- `src/compilers/compile.ts` line 6: "Replaces the former BaseCompiler class hierarchy" — this is now two waves old, the comment adds no value
- `src/agents/base/base-agent.ts` line 5: "Replaces the former BaseAgentImpl abstract class" — stale reference
- `src/skills/base/base-skill.ts` line 5: "Replaces the former BaseSkillImpl abstract class" — stale reference
- `src/rules/base/base-rule.ts` line 5: "Replaces the former BaseRuleImpl abstract class" — stale reference
- Various `.schemas.ts` files: "Note: We don't include function validations in Zod schemas" — review whether still accurate after Wave 3 changes

**Approach:** Only delete clearly stale comments. If a comment is ambiguous, leave it. Do not add replacements.

**Files:** Various files across `src/` (identified by grep)

**Verify:** `grep -rn "BaseAgentImpl\|BaseSkillImpl\|BaseRuleImpl\|BaseCompiler\|ClaudeCompiler\|CursorCompiler\|PluginCompiler" src/ --include="*.ts" | wc -l` returns 0.

### Task 55.4.8: Final safeParse/parse audit

Audit all Zod `parse()` and `safeParse()` usage across `src/` to ensure the boundary convention is followed:

- **safeParse()** at system boundaries: config file loading, user input, external API responses
- **parse()** for internal trusted data: factory functions, default configs, test fixtures

**Known patterns to verify:**
| File | Current Usage | Correct? |
|------|--------------|----------|
| `src/agents/base/base-agent.ts` | `agentConfigSchema.parse(config)` | Yes (internal factory, fail-fast is correct) |
| `src/skills/base/base-skill.ts` | `skillConfigSchema.parse(config)` | Yes (internal factory) |
| `src/rules/base/base-rule.ts` | `ruleConfigSchema.parse(config)` | Yes (internal factory) |
| `src/rules/index.ts` | `profileConfigSchema.parse(workflow)` | Yes (config boundary, but wrapped in try/catch -- acceptable) |
| `src/harness/runner.ts` | `raw.harness as HarnessConfig` | No (fixed in Task 55.4.4) |
| `src/compilers/plugin.types.ts` | `pluginManifestSchema.parse(input)` | Yes (internal factory) |

**Audit steps:**

1. `grep -rn "\.parse(" src/ --include="*.ts"` — list all parse() calls
2. `grep -rn "\.safeParse(" src/ --include="*.ts"` — list all safeParse() calls
3. For each `parse()` at a system boundary, evaluate whether `safeParse()` would be more appropriate
4. Document findings. Only change calls that are clearly unsafe (throwing in a context where the caller cannot handle the exception)

**Files:** Various (audit-driven)

**Verify:** Documented audit results. No `parse()` calls at unguarded system boundaries.

### Task 55.4.9: Update test files for harness and complexity migrations

Update test files that import from `harness/types.ts` and `complexity/types.ts` to use the new Zod schema names.

**Files to update:**

| Test File                                      | What Changes                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `__tests__/src/harness/config.test.ts`         | Import `DEFAULT_HARNESS_CONFIG` (name unchanged), verify schema names                                                                                              |
| `__tests__/src/harness/runner.test.ts`         | Import `HarnessConfig` type, `DEFAULT_HARNESS_CONFIG`                                                                                                              |
| `__tests__/src/complexity/types.test.ts`       | Verify type imports align with new Zod schema names                                                                                                                |
| `__tests__/src/complexity/defaults.test.ts`    | Verify ComplexityGate usage                                                                                                                                        |
| `__tests__/src/complexity/integration.test.ts` | Verify type imports                                                                                                                                                |
| `__tests__/src/iteration/convergence.test.ts`  | Imports `ParsedError` from harness/types                                                                                                                           |
| `__tests__/src/iteration/classifier.test.ts`   | Imports `ParsedError`, `CheckResult` from harness/types                                                                                                            |
| `__tests__/src/hooks/hook-registry.test.ts`    | If hookRegistry is now thunks, update access pattern                                                                                                               |
| `__tests__/scripts/check-drift.test.ts`        | Update `Object.values(hookRegistry).map((h) => h.script)` calls (lines ~197, ~214, ~395) to call thunk first: `Object.values(hookRegistry).map((h) => h().script)` |

**Steps:**

1. Update import names if schemas were renamed (e.g., if `DEFAULT_HARNESS_CONFIG` is now validated differently)
2. Update type annotations to match new Zod-inferred types
3. If hookRegistry/parserRegistry become thunks, update test access patterns
4. Run affected test files individually first, then full suite

**Files:** 7+ test files (see table)

**Verify:** `bun test` passes all tests.

### Task 55.4.10: Run full build and test suite — final verification

This is the final verification for the entire Phase 55. All 4 waves should be complete.

**Commands:**

```bash
# SHA-256 checksum of outputs BEFORE final build
find .claude .cursor dist/plugin -type f \( -name "*.md" -o -name "*.mdc" -o -name "*.json" -o -name "*.sh" \) | sort | xargs shasum -a 256 > /tmp/final-pre-checksums.txt

# Full build
bun run build:all

# SHA-256 checksum of outputs AFTER build
find .claude .cursor dist/plugin -type f \( -name "*.md" -o -name "*.mdc" -o -name "*.json" -o -name "*.sh" \) | sort | xargs shasum -a 256 > /tmp/final-post-checksums.txt

# Compare (internal-only changes should produce identical output)
diff /tmp/final-pre-checksums.txt /tmp/final-post-checksums.txt

# Full test suite
bun test

# Drift check
bun run check:drift

# Typecheck
bunx --bun tsc --noEmit

# Final validation: no .types.ts files remain for entities
test ! -f src/agents/types/agent.types.ts
test ! -f src/skills/types/skill.types.ts
test ! -f src/rules/types/rule.types.ts
test ! -f src/rules/profiles/profile.types.ts

# Final validation: no stale imports
grep -rn "from.*agent\.types\b" src/ __tests__/ --include="*.ts" | grep -v "plugin.types" | wc -l  # Should be 0
grep -rn "from.*skill\.types\b" src/ __tests__/ --include="*.ts" | wc -l  # Should be 0
grep -rn 'from.*rule\.types\b' src/ __tests__/ --include="*.ts" | grep -v "plugin.types" | wc -l  # Should be 0
```

**Verify:** All commands pass. Compiled output matches pre-build checksums (zero unintended output changes).

## Wave Dependencies

- Depends on Plan 55.3 (Wave 3) completion
- Specifically needs: All `.types.ts` files deleted, all consumers migrated to `.schemas.ts`
- Uses naming convention established in Wave 2

## Success Criteria

1. **harness/types.ts** — all 6 interfaces are Zod schemas
2. **complexity/types.ts** — all interfaces/unions are Zod schemas
3. **hooks/index.ts** — `HookDefinition` is a Zod schema
4. **Config loading** — `loadHarnessConfig` uses `safeParse` instead of `as` cast
5. **Registries** — `hookRegistry`, `parserRegistry`, and `profileRegistry` use thunks
6. **Object.freeze** — no calls outside `deep-freeze.ts`
7. **Stale comments** — removed
8. **safeParse/parse** — correctly applied per boundary convention
9. `bun run build:all` passes
10. `bun test` passes all ~1763 tests
11. `bun run check:drift` passes
12. `bunx --bun tsc --noEmit` passes with zero errors

## Verification

```bash
# Comprehensive final check
bun run build:all && bun test && bun run check:drift && bunx --bun tsc --noEmit && echo "Phase 55 COMPLETE"
```

## Phase 55 Completion Checklist

After all 4 waves, verify:

- [ ] Zero `.types.ts` files for entities (agent, skill, rule, profile)
- [ ] All Zod schema objects use PascalCase+Schema naming
- [ ] All Zod-inferred types use plain PascalCase naming
- [ ] Single `.schemas.ts` per entity
- [ ] `Section` type canonical in `src/shared/format.ts`
- [ ] `lu-workflow.rule.ts` in `src/rules/general/`
- [ ] All registries use thunk pattern
- [ ] No `Object.freeze()` outside `deep-freeze.ts`
- [ ] No stale comments referencing old class patterns
- [ ] `safeParse` at boundaries, `parse` internally
- [ ] Build passes, tests pass, drift check passes, tsc passes
