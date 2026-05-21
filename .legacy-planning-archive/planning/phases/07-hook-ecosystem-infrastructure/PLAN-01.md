---
phase: 07
plan: 01
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 07 Plan 01: Hook Portability Abstraction Layer

## Objective

Consolidate the hook system into a clean adapter-registry architecture where adding a new platform requires exactly one adapter file. The canonical hook system is already partially implemented (CanonicalHookSchema, platform adapters, portable-hook.ts) but the adapter pattern is spread across `__helpers/` without a formal registry contract. This plan formalizes the adapter directory structure, creates a typed adapter registry, removes legacy duplication, and updates config generators to use the adapter registry exclusively.

## Context

@src/hooks/**schemas/hook.schemas.ts
@src/hooks/**helpers/hook-registry.ts
@src/hooks/**helpers/platform-adapters.ts
@src/hooks/**helpers/config-generators.ts
@src/hooks/\_\_helpers/portable-hook.ts
@src/hooks/index.ts
@.claude/rules/module-boundary.md

## Tasks

### 1. Create Adapter Directory with Typed Contract

**Type:** auto
**TDD:** false
**Depends on:** none

Create `src/hooks/adapters/` directory with:

1. **`adapter.schemas.ts`** -- Define `HookPlatformAdapterSchema` as a Zod schema describing the adapter contract:
   - `platform`: platform identifier (e.g., "claude-code", "cursor", "pi")
   - `event_map`: Record mapping CanonicalEvent to platform-specific event name
   - `adapt`: function signature `(hook: CanonicalHook) => PlatformHookConfig`
   - `generate_config`: function signature for generating platform-specific JSON config from a canonical registry

2. **`claude.adapter.ts`** -- Extract Claude Code adapter from `platform-adapters.ts`:
   - Re-export `CLAUDE_EVENT_MAP` and `adaptForClaude`
   - Include `generateClaudeConfig` (the canonical version from config-generators.ts)
   - Export a `claudeAdapter` object conforming to the contract

3. **`cursor.adapter.ts`** -- Extract Cursor adapter:
   - Re-export `CURSOR_EVENT_MAP` and `adaptForCursor`
   - Include `generateCursorConfig` (from config-generators.ts)
   - Export a `cursorAdapter` object

4. **`pi.adapter.ts`** -- Extract Pi adapter:
   - Re-export `PI_EVENT_MAP` and `adaptForPi`
   - Include `generatePiConfig` (from config-generators.ts)
   - Export a `piAdapter` object

5. **`index.ts`** -- Barrel re-exporting all adapters and the adapter registry

Keep `platform-adapters.ts` and `config-generators.ts` intact as thin wrappers that delegate to adapter files (backward compatibility during migration).

**Files to create/edit:**

- `src/hooks/adapters/adapter.schemas.ts` (new)
- `src/hooks/adapters/claude.adapter.ts` (new)
- `src/hooks/adapters/cursor.adapter.ts` (new)
- `src/hooks/adapters/pi.adapter.ts` (new)
- `src/hooks/adapters/index.ts` (new)

**Verification:**

- Each adapter file exports a conforming adapter object
- `bunx --bun tsc --noEmit` passes

### 2. Create Adapter Registry

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `src/hooks/adapters/adapter-registry.ts`:

1. Define `hookAdapterRegistry` as a `Record<SupportedPlatform, HookPlatformAdapter>` mapping platform IDs to adapter objects
2. Export `resolveAdapter(platform: SupportedPlatform)` helper that returns the adapter for a given platform
3. Export `getRegisteredPlatforms()` returning all platform IDs
4. Export `generateConfigForPlatform(platform, registry)` that resolves the adapter and calls its `generate_config` function

Update `src/hooks/adapters/index.ts` to re-export registry functions.

**Files to create/edit:**

- `src/hooks/adapters/adapter-registry.ts` (new)
- `src/hooks/adapters/index.ts` (update)

**Verification:**

- `hookAdapterRegistry` has entries for all 3 platforms
- `resolveAdapter("claude-code")` returns the Claude adapter
- `bunx --bun tsc --noEmit` passes

### 3. Update portable-hook.ts to Use Adapter Registry

**Type:** auto
**TDD:** false
**Depends on:** 2

Refactor `src/hooks/__helpers/portable-hook.ts`:

1. Replace the inline `PLATFORM_ADAPTERS` record with an import from the adapter registry
2. `createPortableHook` should use `resolveAdapter(platform).adapt(canonical)` instead of the hardcoded map
3. `detectPlatform` stays as-is (it is environment detection, not adapter logic)

**Files to create/edit:**

- `src/hooks/__helpers/portable-hook.ts` (update)

**Verification:**

- `createPortableHook()` produces identical output for all 3 platforms
- `bunx --bun tsc --noEmit` passes

### 4. Update Hook Module Barrel and Build Pipeline

**Type:** auto
**TDD:** false
**Depends on:** 3

1. Update `src/hooks/index.ts` to re-export the adapter registry and individual adapters from `./adapters/`
2. Ensure `platform-adapters.ts` and `config-generators.ts` remain as backward-compatible re-exports (they delegate to adapter files)
3. Verify the build pipeline (`bun run build:all`) still generates correct platform configs

**Files to create/edit:**

- `src/hooks/index.ts` (update)

**Verification:**

- `bun run build:all` completes successfully
- Generated `.claude/settings.json`, `.cursor/hooks.json` configs are identical to pre-refactor
- `bun run check:drift` passes (no unintended changes to generated output)
- `bunx --bun tsc --noEmit` passes

### 5. Mark Legacy Wrappers as Deprecated

**Type:** auto
**TDD:** false
**Depends on:** 4

Add `@deprecated` JSDoc tags to:

1. `platform-adapters.ts` top-level exports (point to `adapters/` equivalents)
2. Legacy functions in `config-generators.ts` (`generateClaudeHooksConfig`, `generateCursorHooksConfig`, `generatePiExtension`) -- these already have `@deprecated` on the Pi function, extend to Claude/Cursor legacy versions
3. `hookRegistry` in `hook-registry.ts` (point to `canonicalHookRegistry`)

Do NOT remove any legacy exports -- only annotate them for future cleanup.

**Files to create/edit:**

- `src/hooks/__helpers/platform-adapters.ts` (update JSDoc)
- `src/hooks/__helpers/config-generators.ts` (update JSDoc)
- `src/hooks/__helpers/hook-registry.ts` (update JSDoc)

**Verification:**

- `@deprecated` annotations are present on all legacy functions
- No functional changes
- `bunx --bun tsc --noEmit` passes

## Verification

- All 3 platform adapters are registered in `hookAdapterRegistry`
- Adding a new platform requires creating one adapter file + registering it
- `createPortableHook()` uses the adapter registry
- Build pipeline produces identical output
- `bun run build:all && bun run check:drift` passes
- `bunx --bun tsc --noEmit` passes
- Legacy exports remain functional but marked deprecated

## Success Criteria

- The hook system has a formal adapter-registry architecture
- Each platform's logic is isolated in one file under `src/hooks/adapters/`
- The canonical hook registry is the single source of truth (legacy registry delegates to it)
- Adding a 4th platform (e.g., Windsurf) requires exactly: 1 new adapter file + 1 registry entry

## Output Specification

- New directory: `src/hooks/adapters/` with 6 files
- Updated: `src/hooks/__helpers/portable-hook.ts`
- Updated: `src/hooks/index.ts`
- Deprecated annotations on legacy wrappers
