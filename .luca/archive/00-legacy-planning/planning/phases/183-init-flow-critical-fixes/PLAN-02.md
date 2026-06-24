---
phase: 183
plan: 2
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 183 Plan 2: Detect Global Mode in vault:init and Skip Harness Generation

## Objective

Fix `vault:init` deploying the full harness (agents, skills, rules, hooks, settings) into the project directory when running from a global install (REQ-04). In global mode, `luca init` Step 3 already deploys the harness to `~/.claude/`. The `vault:init` command should only create `.planning/` config files in global mode, not duplicate the harness into the project's `.claude/` directory.

## Context

@packages/luca-framework/src/commands/vault-init.ts
@packages/luca-framework/src/utils/runtime-context.ts
@packages/luca-framework/src/utils/files.ts
@.planning/phases/183-init-flow-critical-fixes/183-RESEARCH.md
@.planning/phases/183-init-flow-critical-fixes/183-CONTEXT.md

## Tasks

### 1. Add `planningOnly` option to `generateFiles()`

**Type:** auto
**TDD:** false
**Depends on:** none

Add an optional `planningOnly` boolean to the `generateFiles()` options that short-circuits after creating the `.planning/` directory and its config files, skipping all harness file generation.

**Implementation:**

In `packages/luca-framework/src/utils/files.ts`:

1. Add `planningOnly?: boolean` to the options parameter of `generateFiles()`:

   ```typescript
   export async function generateFiles(options: {
     config: LucaConfig;
     cwd?: string;
     planningOnly?: boolean;
   }): Promise<...>
   ```

2. After the `.planning/` directory creation and config file copying (the first logical section that creates `.planning/config.json`, `.planning/BRAIN.md`, `.planning/WORKING.md`, `.planning/MEMORY.md`), add an early return:

   ```typescript
   if (options.planningOnly) {
     // In global mode, only .planning/ files are needed.
     // The harness (agents, skills, rules, hooks) is deployed
     // globally to ~/.claude/ by `luca init` Step 3.
     return {
       success: true,
       data: manifest,
       stats: { ... },
     };
   }
   ```

3. The early return stats should reflect only the `.planning/` files that were created.

4. Update the JSDoc on `generateFiles()` to document the new option.

**Files to create/edit:**

- `packages/luca-framework/src/utils/files.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `planningOnly: true` creates only `.planning/` files
- `planningOnly: false` (or omitted) creates the full harness (existing behavior unchanged)

### 2. Import `detectRuntimeContext` in vault-init.ts and gate file generation

**Type:** auto
**TDD:** false
**Depends on:** 1

Add runtime mode detection to `vault-init.ts` and pass `planningOnly: true` when running in global mode.

**Implementation:**

In `packages/luca-framework/src/commands/vault-init.ts`:

1. Add import at top:

   ```typescript
   import { detectRuntimeContext } from "../utils/runtime-context";
   ```

2. At the start of the `run()` function (after `setupCleanupHandler()`, before `detectProjectContext()`), detect runtime mode:

   ```typescript
   const runtimeCtx = detectRuntimeContext();
   const isGlobalMode = runtimeCtx.mode === "global";
   ```

3. Modify the `generateFiles()` call at line 181 to pass the mode flag:

   ```typescript
   const result = await generateFiles({
     config,
     planningOnly: isGlobalMode,
   });
   ```

4. When in global mode, add an info log before file generation:

   ```typescript
   if (isGlobalMode) {
     p.log.info(
       "Global install detected -- creating .planning/ config files only (harness already in ~/.claude/).",
     );
   }
   ```

5. Update the success output (the `logger.box` at the end) to reflect that harness files were not created in global mode. Conditionally show the harness directories line:
   ```typescript
   const harnessLine = isGlobalMode
     ? "- Harness files: deployed globally to ~/.claude/ (via luca init)"
     : `- ${harnessNames} (harness-specific files)`;
   ```

**Files to create/edit:**

- `packages/luca-framework/src/commands/vault-init.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- In global mode: only `.planning/` directory is created, no `.claude/`, `.cursor/`, `.pi/` directories
- In dev mode: existing behavior is preserved (full harness generation)
- Success output message correctly reflects what was created

### 3. Update vault-init.ts JSDoc to document mode behavior

**Type:** auto
**TDD:** false
**Depends on:** 2

Update the command-level JSDoc on `vaultInitCommand` to document the global vs dev mode behavior.

**Implementation:**

Add a section to the existing JSDoc (currently lines 23-53) explaining:

- In global mode, only `.planning/` config files are created
- In dev mode, the full harness is generated
- The detection is automatic via `detectRuntimeContext()`

**Files to create/edit:**

- `packages/luca-framework/src/commands/vault-init.ts` (update JSDoc)

**Verification:**

- JSDoc clearly documents both modes
- Includes `@see detectRuntimeContext` reference

## Verification

1. `bunx --bun tsc --noEmit` passes with zero errors
2. Global mode: `vault:init` creates `.planning/config.json`, `.planning/BRAIN.md` but NOT `.claude/` harness files
3. Dev mode: `vault:init` creates the full harness (unchanged from current behavior)
4. The vault wizard still runs in both modes (vault name + API key prompts)
5. Success output correctly describes what was created in each mode

## Success Criteria

- REQ-04 satisfied: `vault:init` skips harness generation in global mode
- No regressions: Dev mode behavior is unchanged
- Clear UX: User sees a log message explaining why only `.planning/` was created in global mode
- Vault wizard still runs: The vault name and API key flow works identically in both modes

## Output Specification

- Modified file: `packages/luca-framework/src/utils/files.ts` (`planningOnly` option)
- Modified file: `packages/luca-framework/src/commands/vault-init.ts` (mode detection + conditional generation)
- New import in vault-init.ts: `detectRuntimeContext` from `runtime-context.ts`
