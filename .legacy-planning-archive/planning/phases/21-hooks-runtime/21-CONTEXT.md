# Phase 21: Hooks & Runtime - Context

**Gathered:** 2026-02-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate plugin-compatible hooks, adapt hook scripts for plugin runtime environment, and implement SessionStart initialization. The plugin hooks must work with `${CLAUDE_PLUGIN_ROOT}` paths and be self-contained within `dist/plugin/`.

**Scope from ROADMAP:** HOOK-01 through HOOK-05

**Key constraint:** Plugin users may not have the Luca source tree (`src/`, `scripts/`, `.claude/`). Hooks must work in a standalone plugin context with only `.planning/` and the project's own files.

</domain>

<decisions>
## Implementation Decisions

### Scope Assessment — What's Already Done

Phase 19 already built significant hooks infrastructure for the plugin:

- `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}` paths — **HOOK-01 partially satisfied**
- All 6 hook scripts copied to `dist/plugin/scripts/` with `chmod +x`
- `generatePluginHooksConfig()` in `scripts/build-plugin.ts`
- Dual-format stdin/stdout parsing in all scripts — **HOOK-04 satisfied**

**What remains:**

- Remove `pre-commit-drift-check` from plugin hooks (development-only concern)
- Add `session-start` hook (new: `.planning/` initialization)
- Adapt `pre-commit-gate` for runtime detection (bun vs npm vs node)
- Add fallback to `context-monitor` for WORKING.md size when transcript_path unavailable
- Validate/test all hooks work in plugin-only context

### Hook Roster for Plugin (5 hooks, not 6)

Exclude `pre-commit-drift-check` from the plugin. It checks for `src/` → `.claude/` drift which only applies to Luca development, not plugin consumers. The hook references `scripts/check-drift.ts` which doesn't exist in plugin context.

**Plugin hooks (5):**

1. `post-edit-format` — Auto-format after file edits
2. `post-edit-typecheck` — Async type-check after TypeScript edits
3. `pre-commit-gate` — Block commits on test/typecheck failures
4. `context-monitor` — Warn on high context usage
5. `session-persist` — Save session state on exit

**New hook (added to registry):** 6. `session-start` — Initialize `.planning/` directory on SessionStart

Implementation: Add `pluginExclude` flag to `HookDefinition` for drift-check, or maintain a `PLUGIN_EXCLUDED_HOOKS` set (following the `COMMAND_EXCLUDED_SKILLS` pattern from Phase 20).

### SessionStart Hook — Full Scaffold with Auto-Detection

**Behavior: Validate & Repair**

- If `.planning/` exists, check each required file and create only missing ones
- Never overwrite existing files
- Handles partial setup cases (e.g., config.json exists but BRAIN.md doesn't)

**Files created on fresh project:**

- `BRAIN.md` — Auto-detect from project files (package.json, tsconfig, etc.)
- `MEMORY.md` — Empty template with section headers
- `WORKING.md` — Empty template
- `STATE.md` — Minimal template (no milestone, no phase)
- `ROADMAP.md` — Empty template with section headers
- `config.json` — Standard Luca defaults (same as `luca init`)

**Auto-detection for BRAIN.md:**

- Read `package.json` → extract name, description, dependencies (infer stack)
- Read `tsconfig.json` → confirm TypeScript usage, detect strict mode
- Check for common config files (`next.config.*`, `vite.config.*`, `tailwind.config.*`)
- Pre-populate Stack and Architecture sections
- Leave Conventions and Preferences as placeholders

**Bun availability check:**

- SessionStart checks if `bun` is in PATH
- If not found, output `systemMessage` warning: "Luca hooks require Bun. Install from https://bun.sh. Hooks will not function without it."
- This is a prerequisite warning, not a fallback — Luca requires Bun

**Idempotency:** The hook must be safe to run every session. It never overwrites, only creates missing files. It's silent when everything is already set up.

### Pre-Commit Gate — Runtime Detection via config.json

The `pre-commit-gate.sh` currently hardcodes `bun test` and `bunx --bun tsc`. For plugin users who may use npm/node:

- SessionStart hook writes `runtime` field to `config.json`: `"runtime": "bun"` or `"runtime": "node"`
- Pre-commit gate reads `config.json` to determine correct commands:
  - `bun` → `bun test`, `bunx --bun tsc`
  - `node` → `npm test`, `npx tsc`
- If config.json doesn't exist or has no runtime field, default to `bun` (existing behavior)
- Runtime detection logic: check `bun --version` success → `"bun"`, else `"node"`

### Context Monitor — WORKING.md Fallback

The context monitor currently relies on `transcript_path` from the Stop event stdin. In plugin context, this may not be available.

**Adaptation:**

- Primary: Use `transcript_path` if available (existing behavior)
- Fallback: Check `WORKING.md` file size as secondary proxy
- WORKING.md grows during sessions as the session log accumulates
- Different thresholds for WORKING.md (smaller file, different growth rate):
  - Warn: 20KB
  - Alert: 40KB
  - Critical: 60KB
- Both checks run; the higher severity level wins

### Claude's Discretion

- Exact BRAIN.md auto-detection heuristics (which config files to check, how to infer architecture)
- Default content for MEMORY.md, WORKING.md, ROADMAP.md templates
- SessionStart hook implementation details (pure bash vs bash+bun hybrid)
- Whether to use `PLUGIN_EXCLUDED_HOOKS` set or `pluginExclude` field on HookDefinition
- How to read config.json in bash hooks (bun -e for JSON parsing, or simpler grep for single field)
- Session-persist hook: whether to add any plugin-specific behavior

</decisions>

<specifics>
## Specific Ideas

- Follow the `COMMAND_EXCLUDED_SKILLS` pattern from Phase 20 for hook exclusion — maintain a small set rather than per-hook flags
- config.json defaults should match what `luca init` produces exactly — no plugin-specific fields
- Auto-detection should be lightweight (< 2 seconds) since it runs every session start
- BRAIN.md auto-detection is best-effort: if package.json doesn't exist, write empty template sections

</specifics>

<deferred>
## Deferred Ideas

- Plugin lifecycle hooks (init/uninstall) — not available in Claude Code yet (Issue #11240)
- Auto-update mechanism for plugin — handled by Claude Code's marketplace infrastructure
- MCP server bundling for the plugin — Luca doesn't currently use MCP servers
- Config migration/versioning — handle when config schema changes in future versions

</deferred>

---

_Phase: 21-hooks-runtime_
_Context gathered: 2026-02-12_
