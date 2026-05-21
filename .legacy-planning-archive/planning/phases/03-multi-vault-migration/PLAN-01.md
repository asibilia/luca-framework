---
phase: 3
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 03 Plan 1: init-vault Bridge CLI Command

## Objective

Add a `init-vault` subcommand to the bridge CLI (`luca-bridge init-vault`) that provides guided setup for configuring a project-specific MuninnDB vault. This is the only TypeScript code change in Phase 03. It detects the repo name, outputs guided Web UI instructions, writes the vault name to `.planning/config.json`, and verifies connectivity.

This command must exist before Wave 2 (migration/brain tree) because it writes the `muninn.vault` config field that migration reads to determine the target vault.

## Context

Read these files for patterns and conventions:

- @packages/luca-framework/src/state/bridge.ts (bridge CLI subcommand pattern, VALID_SUBCOMMANDS, HELP_TEXT, runBridgeCli switch)
- @packages/luca-framework/src/state/index.ts (barrel exports for bridge handlers)
- @packages/luca-framework/src/emitter/\_\_helpers/muninn-http.ts (MuninnDB HTTP client pattern, env vars)
- @.planning/phases/03-multi-vault-migration/03-CONTEXT.md (decisions, admin API limitations)
- @.planning/phases/03-multi-vault-migration/03-RESEARCH.md (handler skeleton, anti-patterns, code locations)

## Tasks

### 1. Add handleInitVault Handler Function

**Type:** auto
**TDD:** false
**Depends on:** none

Add `handleInitVault` async function to `packages/luca-framework/src/state/bridge.ts`. Follow the existing handler pattern (e.g., `handleSuspend`).

The handler must:

1. **Check existing config:** Read `.planning/config.json` via `Bun.file().json()`. If `muninn.vault` is already set AND `--force` flag is not present, output JSON with `already_configured: true` and return early.

2. **Detect repo name:** Use `Bun.$\`git remote get-url origin\``to extract repo name from git remote URL. Fallback to`process.cwd()`directory name. Allow override via`--vault=<name>` argument.

3. **Output guided setup instructions:** Since MuninnDB admin APIs (vault creation, API key generation) are Web UI only, output JSON with step-by-step instructions:
   - Open MuninnDB Web UI at `http://127.0.0.1:8476`
   - Create vault named `{detected-name}`
   - Generate API key for the vault
   - Add `MUNINN_DB_API_KEY=<key>` to `.env`

4. **Write config:** Set `muninn.vault` field in `.planning/config.json` using `Bun.write()`. Preserve existing config fields (read-modify-write pattern).

5. **Verify connectivity (best-effort):** Attempt `fetch(\`${baseUrl}/api/engrams?limit=1&vault=${vaultName}\`)`with a 5-second timeout. Report`connectivity: "verified"`or`connectivity: "not_verified"`. Use `MUNINN_DB_URL`env var (default`http://127.0.0.1:8476`) and `MUNINN_DB_API_KEY` for Bearer auth.

Use `get` from `lodash/get` for safe nested config access. Use `getArg` and `hasFlag` from the existing `./utils/cli-utils` for argument parsing.

The handler outputs JSON to stdout (same as all other bridge handlers). It does NOT interact with the XState workflow state machine.

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Handler function follows existing pattern (async, JSON output, error handling)
- `--force` flag allows reconfiguration
- `--vault=<name>` allows vault name override
- No XState machine imports in the handler

### 2. Register init-vault as Bridge Subcommand

**Type:** auto
**TDD:** false
**Depends on:** 1

Wire `init-vault` into the bridge CLI dispatch:

1. Add `"init-vault"` to the `VALID_SUBCOMMANDS` array (after `"emit-event"`)
2. Add a `Vault commands:` section to `HELP_TEXT` with: `init-vault           Guided setup for project MuninnDB vault`
3. Add `case "init-vault":` to the `runBridgeCli` switch statement, calling `await handleInitVault(args)`
4. Add `handleInitVault` to the named exports at the bottom of bridge.ts

**Files to edit:**

- `packages/luca-framework/src/state/bridge.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `"init-vault"` is in VALID_SUBCOMMANDS
- HELP_TEXT includes the vault commands section
- Switch case dispatches to handleInitVault
- handleInitVault is in the exports block

### 3. Update Barrel Exports

**Type:** auto
**TDD:** false
**Depends on:** 2

Add `handleInitVault` to the bridge barrel exports in `packages/luca-framework/src/state/index.ts`.

Add it to the existing bridge export block:

```typescript
export {
  // ... existing exports
  handleInitVault,
} from "./bridge";
```

**Files to edit:**

- `packages/luca-framework/src/state/index.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `handleInitVault` is exported from the state package barrel
- Barrel file remains a pure re-export file (no logic)

## Verification

Overall verification for this plan:

1. `bunx --bun tsc --noEmit` passes with zero errors
2. Running `bun packages/luca-framework/src/state/bridge.ts init-vault` outputs valid JSON with wizard instructions
3. Running it a second time outputs `already_configured: true` (idempotent)
4. Running with `--force` reconfigures even when already set
5. `.planning/config.json` contains `muninn.vault` field after running
6. No new dependencies added (all imports are from existing packages)

## Success Criteria

- `luca-bridge init-vault` is a functional bridge subcommand
- Config.json is updated with vault name
- Guided Web UI instructions are output as structured JSON
- Connectivity verification is attempted (best-effort, non-blocking)
- Barrel exports are complete

## Output Specification

- Modified: `packages/luca-framework/src/state/bridge.ts` (handler + registration)
- Modified: `packages/luca-framework/src/state/index.ts` (barrel export)
- Modified: `.planning/config.json` (muninn.vault field written at runtime)
