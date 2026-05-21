# Phase 21: Hooks & Runtime -- Research

**Researched:** 2026-02-12
**Researcher:** lu-phase-researcher
**Phase Goal:** Generate plugin-compatible hooks.json, adapt hook scripts for plugin-relative paths, and implement SessionStart initialization.

---

## 1. Existing Hook Infrastructure

### 1.1 Hook Registry (`src/hooks/index.ts`)

The hook registry is a `Record<string, HookDefinition>` mapping 6 hook names to metadata objects. Each `HookDefinition` has:

- `event` (PascalCase for Claude Code): `PostToolUse`, `PreToolUse`, `Stop`, `SessionEnd`
- `cursorEvent` (camelCase for Cursor): `afterFileEdit`, `beforeShellExecution`, `stop`, `sessionEnd`
- `matcher` / `cursorMatcher`: Regex or string patterns for event filtering
- `script`: Shell script filename in `src/hooks/scripts/`
- `timeout`, `async`, `statusMessage`: Runtime behavior

**Current registry entries (6 hooks):**

| Hook Name                | Event                     | Script                    | Plugin-Relevant?       |
| ------------------------ | ------------------------- | ------------------------- | ---------------------- |
| `post-edit-format`       | PostToolUse (Edit\|Write) | post-edit-format.sh       | Yes                    |
| `post-edit-typecheck`    | PostToolUse (Edit\|Write) | post-edit-typecheck.sh    | Yes                    |
| `pre-commit-gate`        | PreToolUse (Bash)         | pre-commit-gate.sh        | Yes                    |
| `pre-commit-drift-check` | PreToolUse (Bash)         | pre-commit-drift-check.sh | **No** (dev-only)      |
| `context-monitor`        | Stop                      | context-monitor.sh        | Yes (needs adaptation) |
| `session-persist`        | SessionEnd                | session-persist.sh        | Yes                    |

**Key code reference:** `src/hooks/index.ts:38-101` -- full registry definition.

### 1.2 Hook Config Generators

Three generators exist:

1. **`generateHooksConfig()`** (line 107-145): Generates `.claude/settings.json` hooks section using `"$CLAUDE_PROJECT_DIR"/.claude/hooks/` paths
2. **`generateCursorHooksConfig()`** (line 157-181): Generates `.cursor/hooks.json` using `.cursor/hooks/` relative paths
3. **`generatePluginHooksConfig()`** in `scripts/build-plugin.ts` (line 94-132): Generates `dist/plugin/hooks/hooks.json` using `${CLAUDE_PLUGIN_ROOT}/scripts/` paths

All three follow the same pattern: iterate registry, group by event/matcher, produce JSON. The plugin variant differs only in the command path prefix.

### 1.3 Build Pipeline

**`scripts/build-all.ts`** (line 240-358):

- Copies all hook scripts from `src/hooks/scripts/` to `.claude/hooks/` AND `.cursor/hooks/`
- Generates `.claude/settings.json` with hooks section (merges with existing settings)
- Generates `.cursor/hooks.json`
- Calls `buildPlugin()` which independently copies scripts and generates plugin hooks.json

**`scripts/build-plugin.ts`** (line 407-448):

- Iterates ALL entries in `hookRegistry` (no filtering)
- Copies scripts to `dist/plugin/scripts/`
- Makes them executable (`chmod +x`)
- Generates `dist/plugin/hooks/hooks.json`
- Lists hook names in plugin.json manifest

**Key finding:** There is NO `PLUGIN_EXCLUDED_HOOKS` filtering yet. All 6 hooks (including `pre-commit-drift-check`) are currently copied to the plugin. This needs to be added.

---

## 2. Hook Script Analysis

### 2.1 Path Usage Audit

All scripts use `CLAUDE_PROJECT_DIR` via the pattern `PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"` with a fallback to `.` (current directory). No hardcoded absolute paths were found.

| Script                    | Uses PROJECT_DIR                            | Hardcoded Paths                    | Plugin-Safe                  |
| ------------------------- | ------------------------------------------- | ---------------------------------- | ---------------------------- |
| post-edit-format.sh       | No (operates on file path from stdin)       | None                               | **Yes**                      |
| post-edit-typecheck.sh    | Yes (line 49: `"${CLAUDE_PROJECT_DIR:-.}"`) | None                               | **Yes**                      |
| pre-commit-gate.sh        | Yes (line 46: `"${CLAUDE_PROJECT_DIR:-.}"`) | None                               | **Yes**                      |
| pre-commit-drift-check.sh | Yes (line 42: `"${CLAUDE_PROJECT_DIR:-.}"`) | `scripts/check-drift.ts` (line 70) | **No** (excluded)            |
| context-monitor.sh        | No (uses `transcript_path` from stdin)      | None                               | **Partial** (needs fallback) |
| session-persist.sh        | Yes (line 21: `"${CLAUDE_PROJECT_DIR:-.}"`) | None                               | **Yes**                      |

**Conclusion for HOOK-02:** Existing scripts already work with plugin-relative paths via `CLAUDE_PROJECT_DIR`. The only problematic script (`pre-commit-drift-check.sh`) is being excluded from the plugin. No path adaptation is needed for the remaining 5 scripts.

### 2.2 Dual-Format Parsing Audit

All 6 scripts use `bun -e` for JSON parsing with dual-format stdin support:

| Script                    | Claude Code Format           | Cursor Format         | Dual-Format          |
| ------------------------- | ---------------------------- | --------------------- | -------------------- |
| post-edit-format.sh       | `data.tool_input?.file_path` | `data.file_path`      | **Yes** (line 21-25) |
| post-edit-typecheck.sh    | `data.tool_input?.file_path` | `data.file_path`      | **Yes** (line 21-25) |
| pre-commit-gate.sh        | `data.tool_input?.command`   | `data.command`        | **Yes** (line 28-32) |
| pre-commit-drift-check.sh | `data.tool_input?.command`   | `data.command`        | **Yes** (line 25-29) |
| context-monitor.sh        | `data.stop_hook_active`      | `data.loop_count > 0` | **Yes** (line 28-32) |
| session-persist.sh        | `data.reason`                | `data.reason`         | **Yes** (line 24-27) |

**Output format duality:**

| Script                 | Claude Code Output                                            | Cursor Output                                 |
| ---------------------- | ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| pre-commit-gate.sh     | `{ hookSpecificOutput: { permissionDecision: "deny", ... } }` | `{ permission: "deny", user_message: "..." }` | Uses `isClaude` check (line 103-107) |
| context-monitor.sh     | `{ systemMessage: "..." }`                                    | `{ followup_message: "..." }`                 | Uses `isClaude` check (line 88-90)   |
| post-edit-typecheck.sh | `{ systemMessage: "..." }`                                    | Same                                          | Only Claude format (async delivery)  |

**Conclusion for HOOK-04:** Dual-format parsing is already fully implemented in all scripts. No changes needed.

### 2.3 Bun Dependency

All scripts require `bun` to be available in PATH for JSON parsing (`bun -e`). This is a hard dependency -- scripts will fail silently or crash if bun is not installed. This motivates the SessionStart bun availability check.

---

## 3. SessionStart Hook Specification

### 3.1 Claude Code SessionStart Event

From Phase 11 research (`RESEARCH.md:24`), the SessionStart event:

- **Event name:** `SessionStart` (PascalCase)
- **When:** Session begins or resumes
- **Can block:** No (cannot prevent session from starting)
- **Matcher field:** `source: "startup"`, `"resume"`, `"clear"`, `"compact"`
- **Special env:** `$CLAUDE_ENV_FILE` -- write `export` statements to persist env vars for the session

**Stdin fields for SessionStart:**

```json
{
  "session_id": "abc123",
  "cwd": "/path/to/project",
  "source": "startup",
  "hook_event_name": "SessionStart"
}
```

Notable: `transcript_path` and `tool_input` are NOT available at SessionStart.

**Cursor equivalent:** There is no direct `sessionStart` event documented for Cursor. The closest is the hook system's initialization. The `session-start.sh` script should handle this gracefully by checking for the `CLAUDE_PROJECT_DIR` env var.

### 3.2 `$CLAUDE_ENV_FILE` for Environment Persistence

The `CLAUDE_ENV_FILE` env var is only available during SessionStart hooks. Writing `export VAR=value` to this file makes the variable available for the entire session. This could be used to set:

- `LUCA_RUNTIME=bun` (runtime detection result)
- `LUCA_PLANNING_DIR=/path/to/.planning` (planning directory location)

However, since other hooks can read `config.json` directly, using `CLAUDE_ENV_FILE` is optional.

### 3.3 Hook Definition for SessionStart

New entry needed in `hookRegistry`:

```typescript
"session-start": {
  event: "SessionStart",
  cursorEvent: "sessionStart",  // May not exist in Cursor
  matcher: undefined,            // Always fire on session start
  cursorMatcher: undefined,
  script: "session-start.sh",
  timeout: 15,                   // Allow time for file creation + auto-detection
  async: false,                  // Must complete before session proceeds
  statusMessage: "Initializing Luca...",
}
```

**Timeout consideration:** 15 seconds should be sufficient for:

- Directory creation (< 1s)
- 6 file existence checks (< 1s)
- package.json/tsconfig.json reading for BRAIN.md auto-detection (< 2s)
- bun availability check (< 1s)
- Total: < 5s typical, 15s max for slow filesystems

---

## 4. SessionStart Implementation Patterns

### 4.1 Script Structure: Bash + Bun Hybrid

The recommended pattern follows the existing hook convention: bash shell script that calls `bun -e` for JSON processing and complex logic.

**Why hybrid (not pure bash):**

- Bash handles: file existence checks, directory creation, chmod -- fast and portable
- Bun handles: JSON parsing (stdin), JSON writing (config.json), project file reading (package.json), string templating
- Pure bash would require complex JSON generation with `printf`/`cat` and fragile escaping
- Pure bun would add startup overhead for simple file existence checks

**Recommended structure:**

```bash
#!/usr/bin/env bash
# session-start.sh — Initialize .planning/ directory for Luca plugin
set -euo pipefail

INPUT=$(cat)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PLANNING_DIR="$PROJECT_DIR/.planning"

# Step 1: Check bun availability
if ! command -v bun &>/dev/null; then
  # Output systemMessage warning
  printf '{"systemMessage":"Luca hooks require Bun. Install from https://bun.sh"}'
  exit 0  # Don't block session start
fi

# Step 2: Create .planning/ if missing
mkdir -p "$PLANNING_DIR"

# Step 3: Create each missing file (validate & repair mode)
# Use bun -e for files that need JSON or auto-detection

# Step 4: Detect runtime and write to config.json
```

### 4.2 Templates for .planning/ Files

The SessionStart hook needs simplified versions of the templates used by `luca init`. The plugin cannot include the full template system (it's in `packages/luca-framework/`), so templates must be embedded in the shell script or in a companion bun -e block.

**Source templates found:**

| File        | Template Location                                                   | Plugin Approach                          |
| ----------- | ------------------------------------------------------------------- | ---------------------------------------- |
| BRAIN.md    | `packages/luca-framework/templates/base/.planning/BRAIN.md`         | Simplified: embedded in session-start.sh |
| MEMORY.md   | `packages/luca-framework/templates/base/.planning/MEMORY.md`        | Simplified: embedded in session-start.sh |
| WORKING.md  | `packages/luca-framework/templates/base/.planning/WORKING.md`       | Simplified: embedded in session-start.sh |
| STATE.md    | `packages/luca-framework/templates/framework/templates/state.md`    | Minimal: just header + empty sections    |
| ROADMAP.md  | `packages/luca-framework/templates/framework/templates/roadmap.md`  | Minimal: just header + empty sections    |
| config.json | `packages/luca-framework/templates/framework/templates/config.json` | Full JSON: embedded in session-start.sh  |

The base templates use EJS syntax (`<%= branding.frameworkName %>`) which cannot be processed in a shell script. The SessionStart hook should use hardcoded "Luca" branding since plugin users are always using Luca.

### 4.3 BRAIN.md Auto-Detection

The `detectProjectContext()` function in `packages/luca-framework/src/utils/detect.ts` (line 10-50) shows the existing approach:

1. Read `package.json` -- extract `name`, dependencies
2. Check for `react`, `typescript`, `@types/react` in deps
3. Check for `tsconfig.json` existence
4. Classify stack: `react-ts`, `react`, `node-ts`, `node`, `unknown`

**For SessionStart, the auto-detection should:**

1. Read `package.json` (if exists) using `bun -e`:
   - Extract `name` -> Project Name
   - Extract `description` -> Project Purpose
   - Check deps for React, Vue, Angular, Next.js, Express, etc.
   - Infer Language (TypeScript if `typescript` in deps or `tsconfig.json` exists)
   - Infer Testing (from `vitest`, `jest`, `@testing-library/*`, `bun:test`)
2. Check for config files:
   - `tsconfig.json` -> TypeScript, strict mode detection
   - `next.config.*` -> Next.js framework
   - `vite.config.*` -> Vite build tool
   - `tailwind.config.*` -> Tailwind CSS
   - `.prettierrc*` -> Prettier code style
   - `bun.lock` / `bunfig.toml` -> Bun runtime
3. Pre-populate BRAIN.md sections:
   - Project Identity: from package.json name/description
   - Stack: from dependency detection
   - Architecture: leave as placeholder (too complex to infer)
   - Conventions: leave as placeholder
   - Development Preferences: set to Luca defaults

**Recommended template (BRAIN.md, auto-detected):**

```markdown
# Luca Brain

> Project identity and conventions. Loaded at session start.

## Project Identity

- **Name:** ${PROJECT_NAME}
- **Domain:** ${PROJECT_DESCRIPTION}
- **Purpose:** [Why it exists -- customize this]

## Stack

- **Language:** ${LANGUAGE}
- **Framework:** ${FRAMEWORK}
- **Build:** ${BUILD_TOOL}
- **Testing:** ${TEST_FRAMEWORK}
- **Styling:** ${STYLING}

## Architecture Patterns

[Describe key architectural decisions -- customize this]

## Code Conventions

[Add your code style preferences -- customize this]

## Development Preferences

- **Command Prefix:** /lu
- **Workflow:** Luca spec-driven development

---

_Luca Brain initialized (auto-detected from project files)_
```

### 4.4 config.json for Plugin

The framework template `config.json` at `packages/luca-framework/templates/framework/templates/config.json` has 132 lines with full configuration including hooks, harness, complexity matrix, gates, safety, etc.

For SessionStart, the config should match the framework template exactly but without EJS variables. Key sections:

- `mode`, `depth`, `model_profile` -- standard defaults
- `cognitive` -- enabled by default
- `workflow` -- all enabled
- `hooks` -- enabled with bun defaults
- `harness` -- enabled with standard checks
- `complexity` -- full matrix

**New field to add:** `"runtime": "bun"` or `"runtime": "node"` -- written by SessionStart based on bun availability.

### 4.5 Idempotency Requirements

The SessionStart hook runs EVERY session start. It must be idempotent:

- **Never overwrite existing files** -- only create missing ones
- **Silent when fully set up** -- no output if everything exists
- **Validate & repair** -- if `.planning/` exists but `MEMORY.md` is missing, create only `MEMORY.md`
- **Runtime field update** -- config.json runtime field CAN be updated each session (re-detect)

Pattern:

```bash
if [ ! -f "$PLANNING_DIR/BRAIN.md" ]; then
  # Create BRAIN.md with auto-detection
fi
# ...repeat for each file
```

---

## 5. Pre-Commit Gate Runtime Detection

### 5.1 Current State

`pre-commit-gate.sh` hardcodes `bun test` (line 53) and `bunx --bun tsc --noEmit` (line 73). Plugin users may not have bun installed.

### 5.2 Runtime Detection in Bash

```bash
# Detect runtime
if command -v bun &>/dev/null; then
  RUNTIME="bun"
else
  RUNTIME="node"
fi
```

Or read from `config.json`:

```bash
RUNTIME=$(bun -e "
  try {
    const cfg = JSON.parse(await Bun.file('$PLANNING_DIR/config.json').text());
    process.stdout.write(cfg.runtime || 'bun');
  } catch { process.stdout.write('bun'); }
")
```

**Problem with reading config.json:** If `bun` is not available, we cannot use `bun -e` to read the file. The detection must fall back to `node -e` or bash-native JSON parsing.

**Recommended approach:**

1. SessionStart writes `"runtime": "bun"` or `"runtime": "node"` to config.json
2. Pre-commit-gate reads runtime from config.json using whichever runtime is available
3. Fallback chain: try `bun -e`, then try `node -e`, then default to `bun`

```bash
# Read runtime from config.json with fallback
read_runtime() {
  local config="$PROJECT_DIR/.planning/config.json"
  if [ ! -f "$config" ]; then
    echo "bun"
    return
  fi

  if command -v bun &>/dev/null; then
    bun -e "
      const cfg = JSON.parse(await Bun.file('$config').text());
      process.stdout.write(cfg.runtime || 'bun');
    " 2>/dev/null || echo "bun"
  elif command -v node &>/dev/null; then
    node -e "
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('$config', 'utf-8'));
      process.stdout.write(cfg.runtime || 'node');
    " 2>/dev/null || echo "node"
  else
    echo "bun"
  fi
}
```

### 5.3 Command Mapping

| Check      | Bun Runtime                   | Node Runtime           |
| ---------- | ----------------------------- | ---------------------- |
| Tests      | `bun test`                    | `npm test`             |
| TypeScript | `bunx --bun tsc --noEmit`     | `npx tsc --noEmit`     |
| Formatter  | `bunx --bun prettier --write` | `npx prettier --write` |

### 5.4 Scope of Changes

Only `pre-commit-gate.sh` needs runtime adaptation. The other hooks:

- `post-edit-format.sh` -- uses `bunx --bun prettier`; needs similar adaptation
- `post-edit-typecheck.sh` -- uses `bunx --bun tsc`; needs similar adaptation
- `context-monitor.sh` -- uses `bun -e` only for JSON parsing (no test/build commands)
- `session-persist.sh` -- uses `bun -e` only for JSON parsing

**Critical question:** If bun is not available, ALL hooks that use `bun -e` for JSON parsing will fail. This is the fundamental dependency. The SessionStart bun check + warning is essential.

**Practical approach:** Since Luca requires bun (per CLAUDE.md), the runtime field primarily controls `test` and `tsc` commands. The `bun -e` JSON parsing remains a hard requirement. SessionStart warns if bun is missing but does not provide a fallback JSON parser.

---

## 6. Context Monitor Adaptation

### 6.1 Current Implementation

`context-monitor.sh` (line 38-52) extracts `transcript_path` from Stop event stdin JSON:

```bash
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const tp = data.transcript_path;
  if (tp) process.stdout.write(tp);
")

if [ -z "$TRANSCRIPT_PATH" ]; then
  exit 0   # <-- Exits silently if no transcript path
fi
```

**Current thresholds:**

- Warn: 100KB (~30% context)
- Alert: 200KB (~50% context)
- Critical: 300KB (~70% context)

### 6.2 Plugin Environment Issue

In plugin context, `transcript_path` may not be available in the Stop event stdin. The current implementation exits silently when transcript_path is missing, providing no context monitoring at all.

### 6.3 WORKING.md Fallback

Per 21-CONTEXT.md decisions:

- Primary: Use `transcript_path` if available (existing behavior)
- Fallback: Check `.planning/WORKING.md` file size
- Different thresholds for WORKING.md (smaller file, different growth rate):
  - Warn: 20KB
  - Alert: 40KB
  - Critical: 60KB
- Both checks run; higher severity level wins

**Implementation pattern:**

```bash
# Primary check: transcript_path
TRANSCRIPT_LEVEL="NONE"
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')
  # ... existing threshold logic -> sets TRANSCRIPT_LEVEL
fi

# Fallback check: WORKING.md size
WORKING_LEVEL="NONE"
WORKING_MD="$PROJECT_DIR/.planning/WORKING.md"
if [ -f "$WORKING_MD" ]; then
  WMD_SIZE=$(wc -c < "$WORKING_MD" | tr -d ' ')
  WMD_WARN="${CONTEXT_WMD_WARN:-20000}"
  WMD_ALERT="${CONTEXT_WMD_ALERT:-40000}"
  WMD_CRITICAL="${CONTEXT_WMD_CRITICAL:-60000}"

  if [ "$WMD_SIZE" -ge "$WMD_CRITICAL" ]; then
    WORKING_LEVEL="CRITICAL"
  elif [ "$WMD_SIZE" -ge "$WMD_ALERT" ]; then
    WORKING_LEVEL="HIGH"
  elif [ "$WMD_SIZE" -ge "$WMD_WARN" ]; then
    WORKING_LEVEL="MODERATE"
  fi
fi

# Take the higher severity
# ...
```

### 6.4 Level Comparison Logic

Define severity ordering: `NONE < MODERATE < HIGH < CRITICAL`. Use the higher of the two levels for the final warning message. When WORKING.md is the primary signal, the message should mention it:

- "Context usage is high based on WORKING.md growth (~40KB). Consider running /compact..."
- vs existing: "Context usage is high (~200KB transcript)..."

---

## 7. Build Pipeline Changes

### 7.1 PLUGIN_EXCLUDED_HOOKS Set

Following the `COMMAND_EXCLUDED_SKILLS` pattern from Phase 20 (`scripts/build-plugin.ts:74-81`):

```typescript
/**
 * Hooks excluded from plugin builds.
 *
 * pre-commit-drift-check: Development-only hook that checks for
 * src/ -> output drift. References scripts/check-drift.ts which
 * doesn't exist in plugin context.
 */
const PLUGIN_EXCLUDED_HOOKS: ReadonlySet<string> = new Set([
  "pre-commit-drift-check",
]);
```

**Where to apply filtering:**

1. In `buildPlugin()` hook script copy loop (line 411): Skip if `PLUGIN_EXCLUDED_HOOKS.has(hookName)`
2. In `generatePluginHooksConfig()` call: Pass filtered registry
3. In plugin.json manifest: `hookNames` array should exclude filtered hooks

**Approach A (filter at loop level):**

```typescript
for (const [hookName, hookDef] of Object.entries(hookRegistry)) {
  if (PLUGIN_EXCLUDED_HOOKS.has(hookName)) {
    console.log(`  Skipped scripts/${hookDef.script} (plugin-excluded)`);
    continue;
  }
  // ... existing copy logic
}
```

**Approach B (filter registry before passing):**

```typescript
const pluginHookRegistry = Object.fromEntries(
  Object.entries(hookRegistry).filter(
    ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
  ),
);

// Use filtered registry for all plugin hook operations
const pluginHooksConfig = generatePluginHooksConfig(pluginHookRegistry);
// Copy scripts from pluginHookRegistry only
```

**Recommendation:** Approach B is cleaner -- filter once, use everywhere. This ensures hooks.json, script copying, and manifest listing are all consistent.

### 7.2 Adding SessionStart Hook

The new `session-start` hook needs to be:

1. Added to `hookRegistry` in `src/hooks/index.ts`
2. Script created at `src/hooks/scripts/session-start.sh`
3. Automatically included in all builds (Claude, Cursor, Plugin) via existing pipeline

Since SessionStart is a new event not previously used, the generated configs will automatically get a new `"SessionStart"` section in hooks.json.

### 7.3 Plugin.json Manifest Impact

Current manifest lists 6 hooks. After changes:

- Remove: `pre-commit-drift-check` (-1)
- Add: `session-start` (+1)
- Net: Still 6 hooks, but different composition

The manifest is generated dynamically from the hookNames array, so no manual update is needed.

### 7.4 build-all.ts Changes

`build-all.ts` copies ALL hooks to `.claude/hooks/` and `.cursor/hooks/`. The SessionStart hook should be included there too. No filtering is applied in `build-all.ts` (only in `build-plugin.ts`), so the new hook will be automatically included.

For the development build (`.claude/settings.json`), the new SessionStart entry will be automatically generated by `generateHooksConfig()` since it reads from the same `hookRegistry`.

---

## 8. Gaps Between Current State and Requirements

### HOOK-01: Plugin hooks.json with ${CLAUDE_PLUGIN_ROOT} paths

**Current state:** hooks.json IS generated with `${CLAUDE_PLUGIN_ROOT}/scripts/` paths.
**Gap:** `pre-commit-drift-check` is included but should be excluded. `session-start` hook is not yet in the registry.
**Effort:** Small -- add PLUGIN_EXCLUDED_HOOKS filtering, add session-start to registry.

### HOOK-02: Hook scripts work with plugin-relative paths

**Current state:** All 5 plugin-relevant scripts use `CLAUDE_PROJECT_DIR` with `.` fallback. No hardcoded project paths.
**Gap:** None for path resolution. Pre-commit-gate needs runtime detection for `bun test` vs `npm test`.
**Effort:** Small for path compliance. Medium for runtime detection in pre-commit-gate.

### HOOK-03: SessionStart initialization hook

**Current state:** Does not exist.
**Gap:** Complete implementation needed: script, registry entry, templates, auto-detection logic.
**Effort:** Large -- most complex deliverable of this phase.

### HOOK-04: Dual-format stdin/stdout parsing

**Current state:** Fully implemented in all existing scripts.
**Gap:** None for existing scripts. New session-start.sh must also follow the pattern.
**Effort:** None for existing, built into new script.

### HOOK-05: Context monitor adapted for plugin

**Current state:** Exits silently when `transcript_path` unavailable.
**Gap:** Need WORKING.md size fallback with separate thresholds.
**Effort:** Medium -- add secondary check logic and severity comparison.

---

## 9. Implementation Recommendations

### 9.1 Wave Organization (from ROADMAP)

**Wave 1 (parallel):**

- **21-01:** Plugin hooks.json generation with PLUGIN_EXCLUDED_HOOKS filtering
- **21-02:** Hook script verification for plugin paths (mostly validation; add runtime detection to pre-commit-gate)

**Wave 2 (parallel):**

- **21-03:** SessionStart initialization hook (largest deliverable)
- **21-04:** Context monitor WORKING.md fallback + session-persist review

### 9.2 SessionStart Implementation Strategy

**Recommended: Single bash+bun hybrid script with embedded templates.**

The script should:

1. Read stdin JSON (standard hook pattern)
2. Check bun availability; warn via `systemMessage` if missing
3. Create `.planning/` directory
4. For each required file, check existence and create if missing:
   - config.json: Detect runtime, write full config with runtime field
   - BRAIN.md: Auto-detect from package.json/tsconfig.json, write populated template
   - MEMORY.md: Write static template (no auto-detection needed)
   - WORKING.md: Write static template
   - STATE.md: Write minimal template (no phase/milestone info)
   - ROADMAP.md: Write minimal template (empty structure)
5. If `$CLAUDE_ENV_FILE` is available, write `export LUCA_RUNTIME=bun`

**Template embedding approach:** Use `bun -e` with heredoc for each file:

```bash
if [ ! -f "$PLANNING_DIR/MEMORY.md" ]; then
  bun -e "
    const content = \`# Luca Memory

> Long-term learning storage. Updated after verified work.

## Patterns

## Decisions

## Pitfalls

## Preferences

---

*Luca Memory initialized*
\`;
    await Bun.write('$PLANNING_DIR/MEMORY.md', content);
  "
fi
```

Alternatively, use bash heredocs for simpler files and `bun -e` only for files needing auto-detection (BRAIN.md, config.json).

### 9.3 BRAIN.md Auto-Detection with bun -e

The auto-detection for BRAIN.md should be done entirely in a single `bun -e` block to minimize subprocess overhead:

```bash
if [ ! -f "$PLANNING_DIR/BRAIN.md" ]; then
  HOOK_PLANNING_DIR="$PLANNING_DIR" HOOK_PROJECT_DIR="$PROJECT_DIR" bun -e "
    const planningDir = process.env.HOOK_PLANNING_DIR;
    const projectDir = process.env.HOOK_PROJECT_DIR;
    const path = require('path');

    // Auto-detect project info
    let name = 'Project';
    let description = '[What this project does]';
    let language = '[Primary language]';
    let framework = '[Framework]';
    let testing = '[Test framework]';
    let buildTool = '[Build tool]';
    let styling = '[Styling approach]';

    try {
      const pkg = JSON.parse(await Bun.file(path.join(projectDir, 'package.json')).text());
      if (pkg.name) name = pkg.name;
      if (pkg.description) description = pkg.description;

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Language detection
      if (deps.typescript || await Bun.file(path.join(projectDir, 'tsconfig.json')).exists())
        language = 'TypeScript';
      else language = 'JavaScript';

      // Framework detection
      if (deps.react) framework = deps.next ? 'Next.js (React)' : 'React';
      else if (deps.vue) framework = 'Vue';
      else if (deps.angular) framework = 'Angular';
      else if (deps.express) framework = 'Express';
      else if (deps.hono) framework = 'Hono';
      else framework = 'Node.js';

      // Test framework detection
      if (deps.vitest) testing = 'Vitest';
      else if (deps.jest) testing = 'Jest';
      else if (deps['bun:test'] || deps['bun-types']) testing = 'bun:test';
      else testing = 'bun:test';

      // Build tool detection
      if (deps.vite) buildTool = 'Vite';
      else if (deps.webpack) buildTool = 'Webpack';
      else if (deps.esbuild) buildTool = 'esbuild';
      else if (await Bun.file(path.join(projectDir, 'bunfig.toml')).exists()) buildTool = 'Bun';
      else buildTool = 'Bun';

      // Styling detection
      if (deps.tailwindcss) styling = 'Tailwind CSS';
      else if (deps['styled-components']) styling = 'styled-components';
      else styling = '[Styling approach]';
    } catch {
      // No package.json -- use defaults
    }

    const content = \`# Luca Brain
...
\`;

    await Bun.write(path.join(planningDir, 'BRAIN.md'), content);
  "
fi
```

### 9.4 config.json Runtime Field

The config.json produced by SessionStart should be the full framework config (matching `packages/luca-framework/templates/framework/templates/config.json`) with:

- EJS variables replaced with Luca defaults
- New `"runtime"` field at top level
- Branding hardcoded to Luca

**Runtime detection:**

```bash
if command -v bun &>/dev/null; then
  RUNTIME="bun"
else
  RUNTIME="node"
fi
```

**Config.json update pattern** (for existing config without runtime field):

```bash
if [ -f "$PLANNING_DIR/config.json" ]; then
  # Update runtime field only, preserve everything else
  HOOK_CONFIG="$PLANNING_DIR/config.json" HOOK_RUNTIME="$RUNTIME" bun -e "
    const cfg = JSON.parse(await Bun.file(process.env.HOOK_CONFIG).text());
    cfg.runtime = process.env.HOOK_RUNTIME;
    await Bun.write(process.env.HOOK_CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  "
else
  # Write full config with runtime
  # ... embedded config JSON
fi
```

---

## 10. Risk Assessment

### 10.1 High Risk: SessionStart Performance

**Risk:** Auto-detection (reading package.json, checking config files) adds latency to every session start.
**Mitigation:** Idempotent design means the full detection only runs once (when BRAIN.md doesn't exist). Subsequent sessions just check file existence (< 100ms).
**Probability:** Low (after first run).

### 10.2 Medium Risk: Bun Hard Dependency

**Risk:** All hooks fail if bun is not installed, since they use `bun -e` for JSON parsing.
**Mitigation:** SessionStart warning message. This is an acknowledged project requirement (CLAUDE.md mandates bun).
**Probability:** Low for target users (Luca users should have bun).

### 10.3 Medium Risk: WORKING.md Size Thresholds

**Risk:** WORKING.md thresholds (20/40/60 KB) may not correlate well with actual context usage.
**Mitigation:** Make thresholds configurable via environment variables (existing pattern: `CONTEXT_WARN`, `CONTEXT_ALERT`). Tune based on real-world usage.
**Probability:** Medium -- thresholds need empirical validation.

### 10.4 Low Risk: SessionStart Event Availability in Cursor

**Risk:** Cursor may not support `sessionStart` event, making the hook non-functional on Cursor.
**Mitigation:** The hook is primarily for Claude Code plugin. Cursor users use `luca init` instead. The registry entry should still include `cursorEvent` for forward compatibility.
**Probability:** Low impact (Cursor has separate init flow).

### 10.5 Low Risk: config.json Schema Drift

**Risk:** Plugin config.json written by SessionStart may differ from what `luca init` produces (two sources of truth).
**Mitigation:** Embed the canonical config structure in the SessionStart script, matching the framework template exactly. Add a comment noting the source.
**Probability:** Medium over time as config evolves.

### 10.6 Low Risk: BRAIN.md Auto-Detection Inaccuracy

**Risk:** Auto-detection may misidentify frameworks or miss key dependencies.
**Mitigation:** BRAIN.md includes placeholder text (`[customize this]`) encouraging users to review and edit. Auto-detection is best-effort, not authoritative.
**Probability:** Medium (acceptable -- users should customize BRAIN.md anyway).

---

## 11. File References Summary

### Files to Create

| File                                 | Purpose                                 |
| ------------------------------------ | --------------------------------------- |
| `src/hooks/scripts/session-start.sh` | SessionStart initialization hook script |

### Files to Modify

| File                                       | Change                                                                  | Lines                                            |
| ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------ |
| `src/hooks/index.ts`                       | Add `session-start` to hookRegistry                                     | ~10 new lines after line 101                     |
| `scripts/build-plugin.ts`                  | Add `PLUGIN_EXCLUDED_HOOKS` set, filter registry before hook operations | ~15 new lines near line 74, modify lines 411-448 |
| `src/hooks/scripts/context-monitor.sh`     | Add WORKING.md size fallback after transcript_path check                | ~30 new lines after line 48                      |
| `src/hooks/scripts/pre-commit-gate.sh`     | Add runtime detection, use runtime-appropriate commands                 | ~20 modified lines around lines 53, 73           |
| `src/hooks/scripts/post-edit-format.sh`    | Add runtime detection for formatter command                             | ~10 modified lines around line 45                |
| `src/hooks/scripts/post-edit-typecheck.sh` | Add runtime detection for tsc command                                   | ~10 modified lines around line 56                |

### Files Unchanged

| File                                          | Reason                                                            |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `scripts/build-all.ts`                        | New hook automatically included via registry; no filtering needed |
| `src/hooks/scripts/session-persist.sh`        | Already works in plugin context                                   |
| `src/hooks/scripts/pre-commit-drift-check.sh` | Excluded from plugin, no changes needed                           |

### Generated Output Changes

| File                                     | Change                                             |
| ---------------------------------------- | -------------------------------------------------- |
| `dist/plugin/hooks/hooks.json`           | Remove drift-check entries, add SessionStart entry |
| `dist/plugin/scripts/`                   | Remove drift-check.sh, add session-start.sh        |
| `dist/plugin/.claude-plugin/plugin.json` | Updated hooks list (5 -> 6, different composition) |
| `.claude/settings.json`                  | Adds SessionStart event section                    |
| `.claude/hooks/session-start.sh`         | New hook script                                    |
| `.cursor/hooks/session-start.sh`         | New hook script                                    |
| `.cursor/hooks.json`                     | Adds sessionStart event (if Cursor supports it)    |

---

_Research completed: 2026-02-12_
_Total files examined: 18_
_Gaps identified: 3 (SessionStart implementation, context monitor fallback, hook exclusion filtering)_
