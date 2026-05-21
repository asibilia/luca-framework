---
id: "24-01"
title: "Extract shared constants, unify hook config generators, extract marketplace manifest"
wave: 1
requirements: ["DEDUP-04", "CLEAN-04", "DEDUP-02"]
---

# Plan 24-01: Extract Shared Constants, Unify Hook Config Generators, Extract Marketplace Manifest

## Objective

Consolidate the preparatory building blocks that Wave 2 depends on: replace magic strings with named constants, unify the two nearly-identical hook config generators into a single parameterized function, extract `isCommandSkill()` helper and `COMMAND_EXCLUDED_PREFIXES`, and extract the triplicated marketplace manifest into a shared function. These changes reduce duplication and create a clean foundation for the `generateAllOutputs()` extraction in Plan 24-02.

## Context

@scripts/build-shared.ts — receives new exports (constants, unified hook config, marketplace manifest, isCommandSkill)
@src/hooks/index.ts — `generateHooksConfig()` merges into unified function; `NO_MATCHER_SENTINEL` extracted
@scripts/build-all.ts — consumer: update imports to use new shared exports
@scripts/check-drift.ts — consumer: update imports to use new shared exports
@scripts/check-drift.test.ts — consumer: update imports to use new shared exports

## Tasks

### Task 1: Extract magic string constants

**Goal:** Replace all occurrences of `"__no_matcher__"` with a named constant and extract `COMMAND_EXCLUDED_PREFIXES` + `isCommandSkill()` to `build-shared.ts`.

**Files:** `scripts/build-shared.ts`, `src/hooks/index.ts`, `scripts/build-all.ts`, `scripts/check-drift.ts`, `scripts/check-drift.test.ts`

**Steps:**

1. In `src/hooks/index.ts`, add:

   ```typescript
   /** Sentinel value for hooks with no matcher constraint. */
   export const NO_MATCHER_SENTINEL = "__no_matcher__" as const;
   ```

2. Update `generateHooksConfig()` in `src/hooks/index.ts` (lines 131, 133) to use `NO_MATCHER_SENTINEL` instead of the literal `"__no_matcher__"`.

3. Update `generatePluginHooksConfig()` in `scripts/build-shared.ts` (lines 158, 160) to import and use `NO_MATCHER_SENTINEL` instead of the literal `"__no_matcher__"`.

4. In `scripts/build-shared.ts`, add:

   ```typescript
   /**
    * Skill name prefixes excluded from plugin command generation.
    * These skills are internal/reference and not user-invocable.
    */
   export const COMMAND_EXCLUDED_PREFIXES: readonly string[] = [
     "rule-",
     "workflow-start",
   ];

   /**
    * Check whether a skill name should generate a plugin command.
    * Returns false for internal/reference skills.
    */
   export const isCommandSkill = (name: string): boolean =>
     !COMMAND_EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));
   ```

5. Update `scripts/build-all.ts` (line 520-523): remove local `COMMAND_EXCLUDED_PREFIXES` and `isCommandSkill`, import from `build-shared.ts`.

6. Update `scripts/check-drift.ts` (lines 209-211): remove local `COMMAND_EXCLUDED_PREFIXES` and `isCommandSkill`, import from `build-shared.ts`.

7. Update `scripts/check-drift.test.ts` (lines 534-536, 757-759): remove local `COMMAND_EXCLUDED_PREFIXES` and `isCommandSkill`, import from `build-shared.ts`.

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes
- [ ] `bun run check:drift` reports zero drift
- [ ] No remaining literal `"__no_matcher__"` strings in source
- [ ] No remaining local `COMMAND_EXCLUDED_PREFIXES` definitions outside `build-shared.ts`

---

### Task 2: Unify hook config generators into parameterized function

**Goal:** Replace `generateHooksConfig()` (src/hooks/index.ts) and `generatePluginHooksConfig()` (scripts/build-shared.ts) with a single `generateClaudeHooksConfig()` function that accepts a command prefix parameter and optional wrapping behavior.

**Files:** `scripts/build-shared.ts`, `src/hooks/index.ts`, `scripts/build-all.ts`, `scripts/check-drift.ts`, `scripts/check-drift.test.ts`

**Steps:**

1. In `scripts/build-shared.ts`, add the import for `NO_MATCHER_SENTINEL` (created in Task 1):

   ```typescript
   import {
     NO_MATCHER_SENTINEL,
     type HookDefinition,
     hookRegistry,
     generateCursorHooksConfig,
   } from "../src/hooks/index";
   ```

   Then create the unified function:

   ```typescript
   /**
    * Generate Claude Code hooks configuration from the hook registry.
    *
    * Produces a hooks configuration with command paths based on the
    * provided commandPrefix. Optionally wraps the result in a
    * `{ hooks: ... }` envelope for plugin hooks.json files.
    *
    * @param registry - The hook registry mapping hook names to definitions
    * @param options.commandPrefix - Path prefix for hook script commands
    *   e.g., '"$CLAUDE_PROJECT_DIR"/.claude/hooks' or '${CLAUDE_PLUGIN_ROOT}/scripts'
    * @param options.wrapInHooksKey - If true, returns { hooks: events }; otherwise returns events directly
    * @returns A JSON-serializable hooks configuration object
    */
   export function generateClaudeHooksConfig(
     registry: Record<string, HookDefinition>,
     options: {
       commandPrefix: string;
       wrapInHooksKey?: boolean;
     },
   ): Record<string, unknown> {
     const events: Record<
       string,
       Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>
     > = {};

     for (const [_name, def] of Object.entries(registry)) {
       if (!events[def.event]) {
         events[def.event] = [];
       }

       const matcherKey = def.matcher ?? NO_MATCHER_SENTINEL;
       let group = events[def.event].find((g) => {
         if (matcherKey === NO_MATCHER_SENTINEL) return !g.matcher;
         return g.matcher === def.matcher;
       });

       if (!group) {
         group = def.matcher
           ? { matcher: def.matcher, hooks: [] }
           : { hooks: [] };
         events[def.event].push(group);
       }

       const hookEntry: Record<string, unknown> = {
         type: "command",
         command: `${options.commandPrefix}/${def.script}`,
         timeout: def.timeout,
       };

       if (def.async) hookEntry.async = true;
       if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;

       group.hooks.push(hookEntry);
     }

     return options.wrapInHooksKey ? { hooks: events } : events;
   }
   ```

2. Remove the old `generatePluginHooksConfig()` from `scripts/build-shared.ts`.

3. Remove `generateHooksConfig()` from `src/hooks/index.ts`. Keep the export of `NO_MATCHER_SENTINEL`, `HookDefinition`, `hookRegistry`, and `generateCursorHooksConfig()`.

4. Update `scripts/build-all.ts`:
   - Remove import of `generateHooksConfig` from `src/hooks/index`.
   - Remove import of `generatePluginHooksConfig` from `build-shared`.
   - Import `generateClaudeHooksConfig` from `build-shared`.
   - Line 308: Replace `generateHooksConfig(hookRegistry)` with:
     ```typescript
     generateClaudeHooksConfig(hookRegistry, {
       commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
     });
     ```
   - Line 606: Replace `generatePluginHooksConfig(pluginHookRegistry)` with:
     ```typescript
     generateClaudeHooksConfig(pluginHookRegistry, {
       commandPrefix: "${CLAUDE_PLUGIN_ROOT}/scripts",
       wrapInHooksKey: true,
     });
     ```

5. Update `scripts/check-drift.ts`:
   - Remove import of `generateHooksConfig` from `src/hooks/index`.
   - Remove import of `generatePluginHooksConfig` from `build-shared`.
   - Import `generateClaudeHooksConfig` from `build-shared`.
   - Line 153: Replace `generateHooksConfig(hookRegistry)` with:
     ```typescript
     generateClaudeHooksConfig(hookRegistry, {
       commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
     });
     ```
   - Line 245: Replace `generatePluginHooksConfig(pluginHookRegistry)` with:
     ```typescript
     generateClaudeHooksConfig(pluginHookRegistry, {
       commandPrefix: "${CLAUDE_PLUGIN_ROOT}/scripts",
       wrapInHooksKey: true,
     });
     ```

6. Update `scripts/check-drift.test.ts`:
   - Remove import of `generateHooksConfig` from `src/hooks/index`.
   - Remove import of `generatePluginHooksConfig` from `build-shared`.
   - Import `generateClaudeHooksConfig` from `build-shared`.
   - Line 245: Replace `generateHooksConfig(hookRegistry)` with:
     ```typescript
     generateClaudeHooksConfig(hookRegistry, {
       commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
     });
     ```
   - Line 605: Replace `generatePluginHooksConfig(pluginHookRegistry)` with:
     ```typescript
     generateClaudeHooksConfig(pluginHookRegistry, {
       commandPrefix: "${CLAUDE_PLUGIN_ROOT}/scripts",
       wrapInHooksKey: true,
     });
     ```

7. `generateCursorHooksConfig()` stays in `src/hooks/index.ts` unchanged (structurally different format).

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes
- [ ] `bun run check:drift` reports zero drift (byte-identical output)
- [ ] No `generateHooksConfig` function remains in `src/hooks/index.ts`
- [ ] No `generatePluginHooksConfig` function remains in `scripts/build-shared.ts`
- [ ] Both Claude settings.json hooks and plugin hooks.json produce identical output to before

---

### Task 3: Extract `generateMarketplaceManifest()` to build-shared.ts

**Goal:** Replace the identical marketplace manifest object literal in 3 files with a single shared function.

**Files:** `scripts/build-shared.ts`, `scripts/build-all.ts`, `scripts/check-drift.ts`, `scripts/check-drift.test.ts`

**Steps:**

1. In `scripts/build-shared.ts`, add:

   ```typescript
   /**
    * Generate the marketplace manifest for plugin distribution.
    *
    * Contains metadata for the Claude Code plugin marketplace listing.
    * Centralised here to prevent drift across build-all.ts, check-drift.ts,
    * and check-drift.test.ts.
    *
    * @param version - Semver version string from package.json
    * @returns A JSON-serializable marketplace manifest object
    */
   export function generateMarketplaceManifest(version: string): object {
     return {
       $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
       name: "luca-marketplace",
       owner: {
         name: "Alec Sibilia",
       },
       plugins: [
         {
           name: "luca",
           description:
             "Agentic development framework with cognitive memory and spec-driven workflow",
           source: ".",
           category: "development",
           version,
           author: {
             name: "Alec Sibilia",
           },
           homepage: "https://github.com/alecsibilia/luca-framework",
           repository: "https://github.com/alecsibilia/luca-framework",
           license: "MIT",
           keywords: [
             "agent",
             "ai",
             "framework",
             "luca",
             "workflow",
             "cognitive",
           ],
         },
       ],
     };
   }
   ```

2. Update `scripts/build-all.ts` (lines 636-659): Replace the inline marketplace manifest object with:

   ```typescript
   const marketplaceManifest = generateMarketplaceManifest(version);
   ```

   Add `generateMarketplaceManifest` to the import from `build-shared`.

3. Update `scripts/check-drift.ts` (lines 276-299): Replace the inline marketplace manifest object with:

   ```typescript
   const marketplaceManifest = generateMarketplaceManifest(version);
   ```

   Add `generateMarketplaceManifest` to the import from `build-shared`.

4. Update `scripts/check-drift.test.ts` (lines 648-678): Replace the inline marketplace manifest object with:
   ```typescript
   const marketplaceManifest = generateMarketplaceManifest(version);
   ```
   Add `generateMarketplaceManifest` to the import from `build-shared`.

**Verification:**

- [ ] `bun test scripts/check-drift.test.ts` passes
- [ ] `bun run check:drift` reports zero drift
- [ ] No inline marketplace manifest object literals remain in build-all.ts, check-drift.ts, or check-drift.test.ts
- [ ] Generated marketplace.json is byte-identical to before

---

## Success Criteria

- [ ] `NO_MATCHER_SENTINEL` constant replaces all `"__no_matcher__"` literals
- [ ] `COMMAND_EXCLUDED_PREFIXES` and `isCommandSkill()` exist only in `build-shared.ts`
- [ ] `generateClaudeHooksConfig()` replaces both `generateHooksConfig()` and `generatePluginHooksConfig()`
- [ ] `generateCursorHooksConfig()` remains unchanged in `src/hooks/index.ts`
- [ ] `generateMarketplaceManifest()` replaces all 3 inline object literals
- [ ] `bun test` passes (full suite, not just check-drift)
- [ ] `bun run check:drift` passes (zero drift)
- [ ] All generated output files are byte-identical to before this plan
