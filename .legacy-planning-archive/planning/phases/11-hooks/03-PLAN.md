# Plan 11-03: Context Monitor, Session Persistence, and Hook Distribution

## Frontmatter
- **ID**: 11-03
- **Title**: Context Monitor, Session Persistence, and Hook Distribution
- **Phase**: 11 (Hooks)
- **Wave**: 3
- **Depends on**: 11-01 (hook infrastructure), 11-02 (registry pattern established with 3 hooks)
- **Delivers**: HOOK-05, HOOK-06, HOOK-08

## Objective

Complete the hook system with three final capabilities: (1) a context usage monitor that warns when the conversation transcript grows large, (2) session persistence that saves WORKING.md state when a session ends, and (3) integration of hooks into the `luca init` template system so downstream projects get hooks out of the box. This plan closes out Phase 11 by making hooks both fully functional and distributable.

## Context

- `src/hooks/index.ts` -- Hook registry with 3 entries (from 11-01 and 11-02). Must be extended with 2 new entries (`context-monitor` and `session-persist`). The `generateHooksConfig` function handles grouping and config generation automatically.
- `src/hooks/scripts/` -- Contains 3 scripts (from 11-01 and 11-02). Two new scripts will be added here.
- `scripts/build-claude.ts` -- Already copies hook scripts and generates settings.json (from 11-01). No changes needed -- new hooks are picked up automatically from the registry.
- `.planning/phases/11-hooks/RESEARCH.md` -- Section 3.5 details context monitor approaches (transcript file size as proxy, configurable thresholds). Section 3.6 details session persistence (Stop agent hook + SessionEnd command hook, `stop_hook_active` loop prevention). Section 3.8 details `luca init` integration.
- `packages/luca-framework/src/utils/files.ts` -- The `generateFiles()` function creates directories and copies templates during `luca init`. Must be extended to create `.claude/hooks/` and generate `.claude/settings.json`.
- `packages/luca-framework/src/utils/template.ts` -- Template processing utilities. The `copyTemplates` function handles EJS templating and binary copies. Hook scripts (`.sh` files) are NOT in the `TEMPLATE_EXTENSIONS` list, so they will be copied as binary (which is correct -- we do not want EJS processing on shell scripts).
- `packages/luca-framework/templates/framework/templates/config.json` -- Framework config template. Must be extended with a `hooks` section for downstream configuration.
- `packages/luca-framework/templates/framework/index.json` -- Framework index listing contents. Must be updated.
- `packages/luca-framework/src/types.ts` -- `LucaConfig` interface. Does not need changes for this plan (hooks config is in the template config.json, not LucaConfig).

### Key API Details (from Research)

**Stop hook**: Fires when Claude finishes responding. CAN force Claude to continue (block). Receives `stop_hook_active` flag to prevent infinite loops. Agent-type hooks are recommended for WORKING.md verification because they can read files.

**SessionEnd hook**: Fires when the session terminates. CANNOT block. Receives `reason` field (`clear`, `logout`, `prompt_input_exit`, etc.). Good for best-effort cleanup.

**Transcript-based context estimation**: The `transcript_path` field in hook input points to a JSONL file containing the session transcript. File size serves as a rough proxy for context usage. Thresholds must be calibrated (research suggests 100KB warn, 200KB alert, 300KB suggest-compact, but these are estimates).

**stop_hook_active**: When a Stop hook returns `decision: "block"`, Claude is forced to continue. On the next Stop event, `stop_hook_active` is `true`, indicating the hook already triggered. The script MUST check this flag and exit 0 to prevent infinite loops.

## Tasks

### Task 1: Create the context usage monitor hook script

**Goal**: Create a shell script that runs on every `Stop` event (when Claude finishes responding), checks the transcript file size, and warns when it exceeds configurable thresholds. This is the best available approximation for context usage since Claude Code does not expose context percentage directly.

**File**: Create `src/hooks/scripts/context-monitor.sh`

**Details**:

```bash
#!/usr/bin/env bash
# context-monitor.sh — Warn when context usage appears high
#
# Hook event: Stop
# Type: Command hook (synchronous)
# Timeout: 5 seconds
#
# Checks the session transcript file size as a proxy for context usage.
# Outputs a systemMessage warning when thresholds are exceeded.
#
# Thresholds (bytes, configurable via environment or defaults):
#   CONTEXT_WARN=100000      (~100KB, ~30% context)
#   CONTEXT_ALERT=200000     (~200KB, ~50% context)
#   CONTEXT_CRITICAL=300000  (~300KB, ~70% context)
#
# These are rough approximations. Actual context usage depends on
# tokenization, compaction state, and model context window size.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Check stop_hook_active to prevent infinite loops
# If this Stop was triggered by a previous Stop hook blocking, exit immediately
IS_ACTIVE=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  process.stdout.write(String(data.stop_hook_active || false));
")

if [ "$IS_ACTIVE" = "true" ]; then
  exit 0
fi

# Extract transcript path
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const tp = data.transcript_path;
  if (tp) process.stdout.write(tp);
")

# Exit if no transcript path
if [ -z "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Exit if transcript file doesn't exist
if [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Get file size in bytes
FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')

# Configurable thresholds (can be overridden via environment)
WARN_THRESHOLD="${CONTEXT_WARN:-100000}"
ALERT_THRESHOLD="${CONTEXT_ALERT:-200000}"
CRITICAL_THRESHOLD="${CONTEXT_CRITICAL:-300000}"

# Determine warning level
if [ "$FILE_SIZE" -ge "$CRITICAL_THRESHOLD" ]; then
  # Critical — strongly suggest compaction
  LEVEL="CRITICAL"
  MESSAGE="Context usage is very high (~${FILE_SIZE} bytes transcript). Quality may be degrading. Consider running /compact to free context space, or start a new session."
elif [ "$FILE_SIZE" -ge "$ALERT_THRESHOLD" ]; then
  # Alert — recommend compaction
  LEVEL="HIGH"
  MESSAGE="Context usage is high (~${FILE_SIZE} bytes transcript). Consider running /compact soon to maintain response quality."
elif [ "$FILE_SIZE" -ge "$WARN_THRESHOLD" ]; then
  # Warn — informational
  LEVEL="MODERATE"
  MESSAGE="Context usage is moderate (~${FILE_SIZE} bytes transcript). No action needed yet, but be mindful of context limits."
else
  # Below threshold — no warning
  exit 0
fi

# Output systemMessage for Claude to see
# Pass variables via env to avoid shell interpolation in JS strings
HOOK_LEVEL="$LEVEL" HOOK_MSG="$MESSAGE" bun -e "
  const level = process.env.HOOK_LEVEL;
  const message = process.env.HOOK_MSG;
  const msg = { systemMessage: '[Context Monitor: ' + level + '] ' + message };
  process.stdout.write(JSON.stringify(msg));
"

exit 0
```

**Key decisions**:
- **Transcript file size as proxy**: This is an imperfect but functional approach. Claude Code does not expose context percentage. The transcript JSONL file grows with the conversation and provides a reasonable signal.
- **Three threshold levels**: WARN (100KB), ALERT (200KB), CRITICAL (300KB). These are initial estimates and should be tuned based on real-world usage. Environment variables allow project-level override.
- **stop_hook_active check**: Prevents infinite loops. If this Stop event was triggered by a previous hook blocking, we exit immediately.
- **Non-blocking**: Always exits 0. Context warnings are informational, not blocking.
- **Fast execution**: File size check with `wc -c` is near-instant. The bun invocations for JSON parsing are the main cost (~100ms each).

**Verification**:
- Script is valid bash: `bash -n src/hooks/scripts/context-monitor.sh`
- Test with mock input (no transcript): `echo '{"stop_hook_active":false}' | bash src/hooks/scripts/context-monitor.sh; echo $?` exits 0
- Test with stop_hook_active: `echo '{"stop_hook_active":true}' | bash src/hooks/scripts/context-monitor.sh; echo $?` exits 0 immediately

### Task 2: Create the session persistence hook script

**Goal**: Create a shell script that runs on `SessionEnd` to add a timestamp footer to WORKING.md (if it exists). This is best-effort cleanup since SessionEnd cannot block session termination.

**File**: Create `src/hooks/scripts/session-persist.sh`

**Details**:

```bash
#!/usr/bin/env bash
# session-persist.sh — Save session state on exit
#
# Hook event: SessionEnd
# Type: Command hook (synchronous)
# Timeout: 10 seconds
#
# When a session ends, this hook:
# 1. Checks if .planning/WORKING.md exists
# 2. If it has content, appends a session-end timestamp
# 3. Best-effort only — SessionEnd hooks cannot block termination
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Use CLAUDE_PROJECT_DIR env var (consistent with other hooks)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Extract session end reason (for logging)
END_REASON=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  process.stdout.write(data.reason || 'unknown');
")

WORKING_MD="$PROJECT_DIR/.planning/WORKING.md"

# Exit if WORKING.md doesn't exist
if [ ! -f "$WORKING_MD" ]; then
  exit 0
fi

# Exit if WORKING.md is empty
if [ ! -s "$WORKING_MD" ]; then
  exit 0
fi

# Get current timestamp
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Append session-end footer
# Check if file already has a session-end marker to avoid duplicates
if grep -q "^---$" "$WORKING_MD" && grep -q "Session ended:" "$WORKING_MD"; then
  # Already has a session-end marker — update it using Bun APIs
  HOOK_WMD="$WORKING_MD" HOOK_TS="$TIMESTAMP" HOOK_REASON="$END_REASON" bun -e "
    const path = process.env.HOOK_WMD;
    const ts = process.env.HOOK_TS;
    const reason = process.env.HOOK_REASON;
    let content = await Bun.file(path).text();
    content = content.replace(
      /\*Session ended:.*\*/,
      '*Session ended: ' + ts + ' (reason: ' + reason + ')*'
    );
    await Bun.write(path, content);
  "
else
  # No session-end marker — append one
  printf '\n\n---\n*Session ended: %s (reason: %s)*\n' "$TIMESTAMP" "$END_REASON" >> "$WORKING_MD"
fi

exit 0
```

**Key decisions**:
- **SessionEnd only**: The research recommended both a Stop agent hook (to force WORKING.md updates) and a SessionEnd command hook (for cleanup). For simplicity and to avoid complexity of agent-type hooks in this initial implementation, we use only SessionEnd with a command hook. The Stop hook for WORKING.md enforcement can be added as a future enhancement.
- **Best-effort**: SessionEnd cannot block termination. If the script fails, the session still ends. This is acceptable for a timestamp footer.
- **Duplicate detection**: Checks for existing session-end markers before appending, to avoid accumulating multiple markers if the file was already marked.
- **UTC timestamps**: Uses ISO 8601 format in UTC for consistency.
- **Reason tracking**: Records the SessionEnd reason (clear, logout, prompt_input_exit, etc.) for debugging.

**Verification**:
- Script is valid bash: `bash -n src/hooks/scripts/session-persist.sh`
- Test with mock WORKING.md: Create a temp WORKING.md, run `echo '{"cwd":"/tmp/test","reason":"prompt_input_exit"}' | bash src/hooks/scripts/session-persist.sh`, verify timestamp was appended
- Test without WORKING.md: `echo '{"cwd":"/nonexistent","reason":"test"}' | bash src/hooks/scripts/session-persist.sh; echo $?` exits 0

### Task 3: Register both hooks in the hook registry

**Goal**: Add the context monitor and session persistence hooks to `src/hooks/index.ts`.

**File**: Modify `src/hooks/index.ts`

**Details**:

Add these entries to the `hookRegistry` object (after the existing 3 entries):

```ts
'context-monitor': {
  event: 'Stop',
  matcher: undefined,
  script: 'context-monitor.sh',
  timeout: 5,
  async: false,
  statusMessage: 'Checking context usage...',
},
'session-persist': {
  event: 'SessionEnd',
  matcher: undefined,
  script: 'session-persist.sh',
  timeout: 10,
  async: false,
  statusMessage: 'Saving session state...',
},
```

The registry will now have 5 entries. The `generateHooksConfig` function will produce a settings.json with 4 event sections: `PostToolUse`, `PreToolUse`, `Stop`, and `SessionEnd`.

Note that these hooks have no `matcher` (they fire on every event of their type). The `generateHooksConfig` function handles this by creating a group without a `matcher` field.

**Verification**:
- `hookRegistry` has exactly 5 entries
- `generateHooksConfig(hookRegistry)` produces config with 4 event types
- `src/hooks/index.ts` compiles: `bun build src/hooks/index.ts --no-bundle`

### Task 4: Build and verify all 5 hooks

**Goal**: Run the full build pipeline and verify all 5 hook scripts are compiled and the settings.json is correct.

**File**: No file changes. Execution and verification.

**Details**:

```bash
# Build everything
bun run build:all

# Verify all 5 hook scripts exist and are executable
ls -la .claude/hooks/
# Should show 5 .sh files, all executable:
#   post-edit-format.sh
#   post-edit-typecheck.sh
#   pre-commit-gate.sh
#   context-monitor.sh
#   session-persist.sh

# Verify settings.json structure
bun -e "
  const settings = JSON.parse(await Bun.file('.claude/settings.json').text());
  const hooks = settings.hooks;
  console.log('Events configured:', Object.keys(hooks).sort().join(', '));
  for (const [event, groups] of Object.entries(hooks)) {
    const totalHooks = (groups as any[]).reduce((sum, g) => sum + g.hooks.length, 0);
    console.log('  ' + event + ': ' + totalHooks + ' hook(s)');
  }
"
# Expected output:
# Events configured: PostToolUse, PreToolUse, SessionEnd, Stop
#   PostToolUse: 2 hook(s)
#   PreToolUse: 1 hook(s)
#   SessionEnd: 1 hook(s)
#   Stop: 1 hook(s)

# Verify Stop hook has no matcher
bun -e "
  const settings = JSON.parse(await Bun.file('.claude/settings.json').text());
  const stopHook = settings.hooks.Stop[0];
  console.log('Stop matcher:', stopHook.matcher ?? 'none (fires always)');
"

# Run all tests
bun test
```

**Verification**:
- 5 hook scripts in `.claude/hooks/`
- `settings.json` has 4 event types with correct hook counts
- All tests pass

### Task 5: Add hooks configuration to the framework config template

**Goal**: Extend the config.json template (used by `luca init`) with a `hooks` section so downstream projects can configure hook behavior (thresholds, formatter command, enabled/disabled hooks).

**File**: Modify `packages/luca-framework/templates/framework/templates/config.json`

**Details**:

Add a `hooks` section to the existing config.json template:

```json
{
  "mode": "interactive",
  "depth": "standard",
  "model_profile": "balanced",
  "cognitive": {
    "enabled": true,
    "memory_recall": true,
    "working_memory": true,
    "intuition_check": true,
    "routing": "auto"
  },
  "workflow": {
    "research": true,
    "plan_check": true,
    "verifier": true,
    "code_review": true,
    "uat_required": true,
    "always_verify": true,
    "capture_learnings": true
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "plan_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_plans_for_parallel": 2
  },
  "gates": {
    "confirm_project": true,
    "confirm_phases": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_plan": true,
    "execute_next_plan": true,
    "issues_review": true,
    "confirm_transition": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  },
  "hooks": {
    "enabled": true,
    "formatter": "bunx --bun prettier --write",
    "formatterExtensions": [".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md", ".yaml", ".yml", ".html"],
    "typeChecker": "bunx --bun tsc --noEmit",
    "typeCheckExtensions": [".ts", ".tsx"],
    "preCommitChecks": ["bun test", "bunx --bun tsc --noEmit"],
    "commitPatterns": ["git commit", "git merge", "bun run commit"],
    "contextThresholds": {
      "warn": 100000,
      "alert": 200000,
      "critical": 300000
    }
  }
}
```

**Key decisions**:
- The `hooks` section is declarative configuration, not executable code. Hook scripts read these values (or their defaults) at runtime.
- `enabled: true` is the master switch. Setting to `false` would be a signal to skip hook generation during `luca init`.
- Formatter and type-checker commands are configurable for different stacks (e.g., `eslint --fix` instead of `prettier`, `biome check` instead of `tsc`).
- Context thresholds are in bytes (transcript file size).
- Pre-commit checks are an array of commands to run before allowing commits.

**Verification**:
- `config.json` is valid JSON: `bun -e "JSON.parse(await Bun.file('packages/luca-framework/templates/framework/templates/config.json').text()); console.log('valid')"`
- The `hooks` section has all expected keys

### Task 6: Create hook template files for luca init

**Goal**: Create hook script templates and a settings-hooks.json template that `luca init` will copy to downstream projects. These are the distributable versions of the hooks.

**File**: Create `packages/luca-framework/templates/hooks/` directory with script templates and settings template

**Details**:

Create the following template files:

**`packages/luca-framework/templates/hooks/scripts/post-edit-format.sh`**:
Copy from `src/hooks/scripts/post-edit-format.sh` (identical content -- the framework's own hooks are the template).

**`packages/luca-framework/templates/hooks/scripts/post-edit-typecheck.sh`**:
Copy from `src/hooks/scripts/post-edit-typecheck.sh`.

**`packages/luca-framework/templates/hooks/scripts/pre-commit-gate.sh`**:
Copy from `src/hooks/scripts/pre-commit-gate.sh`.

**`packages/luca-framework/templates/hooks/scripts/context-monitor.sh`**:
Copy from `src/hooks/scripts/context-monitor.sh`.

**`packages/luca-framework/templates/hooks/scripts/session-persist.sh`**:
Copy from `src/hooks/scripts/session-persist.sh`.

**`packages/luca-framework/templates/hooks/settings-hooks.json`**:
A JSON file containing just the hooks section of settings.json. This is used by the init command to merge into an existing or new `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-format.sh",
            "timeout": 10,
            "statusMessage": "Formatting..."
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-typecheck.sh",
            "timeout": 30,
            "async": true,
            "statusMessage": "Type-checking..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-commit-gate.sh",
            "timeout": 120,
            "statusMessage": "Running pre-commit checks..."
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/context-monitor.sh",
            "timeout": 5,
            "statusMessage": "Checking context usage..."
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-persist.sh",
            "timeout": 10,
            "statusMessage": "Saving session state..."
          }
        ]
      }
    ]
  }
}
```

**Key decision**: Hook script templates are identical to the framework's own hooks. This ensures consistent behavior. Future versions could add EJS templating for configurable commands (e.g., replacing `bunx --bun prettier` with a template variable), but for now, concrete defaults are simpler and more reliable.

**Verification**:
- All 5 script files exist in `packages/luca-framework/templates/hooks/scripts/`
- `settings-hooks.json` is valid JSON
- Script files match their `src/hooks/scripts/` counterparts

### Task 7: Update generateFiles() to install hooks during luca init

**Goal**: Extend the `generateFiles()` function in `packages/luca-framework/src/utils/files.ts` to create `.claude/hooks/` directory, copy hook scripts, make them executable, and generate `.claude/settings.json` with the hooks configuration.

**File**: Modify `packages/luca-framework/src/utils/files.ts`

**Details**:

Add a new step between Step 4 (framework files) and Step 5 (manifest creation):

```ts
// Step 4.5: Install Claude Code hooks
spinner.start('Installing Claude Code hooks...');

const claudeDir = join(cwd, '.claude');
const claudeHooksDir = join(claudeDir, 'hooks');

// Create .claude/hooks/ directory
if (!existsSync(claudeHooksDir)) {
  await mkdir(claudeHooksDir, { recursive: true });
  trackCreated(claudeHooksDir);
}

// Copy hook scripts from templates
const hookTemplatesDir = join(templatesDir, 'hooks');
if (existsSync(hookTemplatesDir)) {
  const hookScriptsDir = join(hookTemplatesDir, 'scripts');
  if (existsSync(hookScriptsDir)) {
    const hookFiles = await readdir(hookScriptsDir);
    let hooksCopied = 0;

    for (const hookFile of hookFiles) {
      const srcPath = join(hookScriptsDir, hookFile);
      const destPath = join(claudeHooksDir, hookFile);

      await copyFile(srcPath, destPath);
      trackCreated(destPath);

      // Make script executable (using fs/promises chmod, cross-platform)
      try {
        await chmod(destPath, 0o755);
      } catch {
        // chmod may fail on some platforms (Windows), non-fatal
      }

      hooksCopied++;
    }

    // Generate .claude/settings.json from hook settings template
    const settingsHooksPath = join(hookTemplatesDir, 'settings-hooks.json');
    const claudeSettingsPath = join(claudeDir, 'settings.json');

    if (existsSync(settingsHooksPath)) {
      let existingSettings: Record<string, unknown> = {};

      // Preserve existing settings.json content (if any)
      if (existsSync(claudeSettingsPath)) {
        try {
          const existing = await readFile(claudeSettingsPath, 'utf-8');
          existingSettings = JSON.parse(existing);
        } catch {
          // Invalid JSON — start fresh
        }
      }

      // Read hook settings template
      const hooksContent = await readFile(settingsHooksPath, 'utf-8');
      const hooksSettings = JSON.parse(hooksContent);

      // Merge hooks into settings (preserving other keys like permissions)
      existingSettings.hooks = hooksSettings.hooks;

      await writeFile(
        claudeSettingsPath,
        JSON.stringify(existingSettings, null, 2) + '\n'
      );
      trackCreated(claudeSettingsPath);
    }

    spinner.stop(`Installed ${hooksCopied} hook scripts + settings.json`);
  } else {
    spinner.stop('Hook scripts directory not found, skipping hooks');
  }
} else {
  spinner.stop('Hook templates not found, skipping hooks');
}
```

Also add the required imports at the top of the file (if not already present):
```ts
import { readdir, copyFile, readFile, writeFile, chmod } from 'fs/promises';
```

Note: Some of these imports (`readFile`, `readdir`) may need to be added since the current file only imports `rm` and `mkdir` from `fs/promises`. The `copyFile`, `readFile`, and `writeFile` are available from `fs/promises` and the `readdir` function is also needed.

**Key decisions**:
- Hook installation happens AFTER framework files (Step 4) but BEFORE manifest creation (Step 5), so hooks are tracked in the manifest.
- `.claude/settings.json` is MERGED with existing content to preserve any user-defined permissions or settings.
- Scripts are made executable with `chmod +x`. This may fail on some platforms (Windows) but is non-fatal.
- If hook templates don't exist (older template version), the step is silently skipped.

**Verification**:
- Run `luca init --quick` in a fresh temp directory
- `.claude/hooks/` directory exists with 5 executable `.sh` files
- `.claude/settings.json` exists with `hooks` section containing 4 event types
- If `.claude/settings.json` already existed (with permissions), those are preserved

### Task 8: Update the framework index.json

**Goal**: Add hooks to the framework index so they are listed in the contents.

**File**: Modify `packages/luca-framework/templates/framework/index.json`

**Details**:

Update the `contents` array to include hooks:

```json
{
  "description": "Luca framework files - installed to .cursor/luca/",
  "version": "0.0.1",
  "contents": [
    "workflows/",
    "references/",
    "templates/"
  ],
  "hooks": {
    "description": "Claude Code hooks - installed to .claude/hooks/",
    "scripts": [
      "post-edit-format.sh",
      "post-edit-typecheck.sh",
      "pre-commit-gate.sh",
      "context-monitor.sh",
      "session-persist.sh"
    ]
  }
}
```

**Key decision**: Hooks are listed in a separate `hooks` key (not in `contents`) because they install to `.claude/hooks/` rather than `.cursor/luca/`. This keeps the framework index accurate about where files go.

**Verification**:
- `index.json` is valid JSON
- The `hooks.scripts` array has 5 entries matching the template script filenames

### Task 9: Add TEMPLATE_EXTENSIONS update for .sh files

**Goal**: Ensure `.sh` files are handled correctly by the template system. Shell scripts should NOT be processed as EJS templates (they may contain `<%` patterns that conflict with EJS). Verify they are copied as binary.

**File**: Review `packages/luca-framework/src/utils/template.ts` -- likely NO changes needed

**Details**:

The `TEMPLATE_EXTENSIONS` constant in `template.ts` lists file types processed as EJS templates:
```ts
export const TEMPLATE_EXTENSIONS = [
  '.md', '.json', '.ts', '.tsx', '.js', '.jsx', '.mdc',
  '.yaml', '.yml', '.txt', '.html', '.css', '.gitkeep', '.gitignore',
] as const;
```

`.sh` is NOT in this list, which means shell scripts will be copied as binary by `copyTemplates()`. This is correct behavior -- shell scripts should not have EJS processing applied.

However, since Task 7 uses direct `copyFile()` for hook scripts (not `copyTemplates()`), this is moot. The hook scripts bypass the template system entirely.

**Verification**:
- `.sh` is NOT in `TEMPLATE_EXTENSIONS` (confirmed by code review)
- No changes needed to `template.ts`

### Task 10: Update hook registry tests and add integration tests

**Goal**: Update the hook registry test to verify 5 entries and add tests for the init hook distribution.

**File**: Modify `__tests__/src/hooks/hook-registry.test.ts`, optionally create `__tests__/packages/luca-framework/hooks-template.test.ts`

**Details**:

Update the existing hook registry test:

```ts
test('has exactly 5 entries', () => {
  expect(Object.keys(hookRegistry).length).toBe(5);
});

test('context-monitor fires on Stop event', () => {
  expect(hookRegistry['context-monitor'].event).toBe('Stop');
  expect(hookRegistry['context-monitor'].matcher).toBeUndefined();
});

test('session-persist fires on SessionEnd event', () => {
  expect(hookRegistry['session-persist'].event).toBe('SessionEnd');
  expect(hookRegistry['session-persist'].matcher).toBeUndefined();
});

test('generateHooksConfig produces 4 event types', () => {
  const config = generateHooksConfig(hookRegistry);
  const events = Object.keys(config).sort();
  expect(events).toEqual(['PostToolUse', 'PreToolUse', 'SessionEnd', 'Stop']);
});
```

Add a template verification test:

Create `__tests__/packages/luca-framework/hooks-template.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { readdirSync, existsSync } from 'fs';
import path from 'path';

const TEMPLATES_DIR = path.join(import.meta.dir, '../../../packages/luca-framework/templates');
const HOOKS_SCRIPTS_DIR = path.join(TEMPLATES_DIR, 'hooks', 'scripts');
const HOOKS_SETTINGS = path.join(TEMPLATES_DIR, 'hooks', 'settings-hooks.json');

describe('hook templates for luca init', () => {
  test('hooks template directory exists', () => {
    expect(existsSync(path.join(TEMPLATES_DIR, 'hooks'))).toBe(true);
  });

  test('all 5 hook scripts exist in templates', () => {
    const scripts = readdirSync(HOOKS_SCRIPTS_DIR).filter(f => f.endsWith('.sh'));
    expect(scripts.length).toBe(5);
    expect(scripts.sort()).toEqual([
      'context-monitor.sh',
      'post-edit-format.sh',
      'post-edit-typecheck.sh',
      'pre-commit-gate.sh',
      'session-persist.sh',
    ]);
  });

  test('settings-hooks.json exists and is valid', () => {
    expect(existsSync(HOOKS_SETTINGS)).toBe(true);
    const content = require('fs').readFileSync(HOOKS_SETTINGS, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('hooks');
    expect(Object.keys(parsed.hooks).sort()).toEqual([
      'PostToolUse', 'PreToolUse', 'SessionEnd', 'Stop'
    ]);
  });

  test('hook scripts in templates match src/hooks/scripts/', () => {
    const srcDir = path.join(import.meta.dir, '../../../src/hooks/scripts');
    const templateScripts = readdirSync(HOOKS_SCRIPTS_DIR).filter(f => f.endsWith('.sh'));
    const srcScripts = readdirSync(srcDir).filter(f => f.endsWith('.sh'));

    // Every template script should exist in src
    for (const script of templateScripts) {
      expect(srcScripts).toContain(script);
    }

    // Every src script should exist in templates
    for (const script of srcScripts) {
      expect(templateScripts).toContain(script);
    }
  });
});
```

**Verification**:
- `bun test __tests__/src/hooks/hook-registry.test.ts` passes (all tests including new ones)
- `bun test __tests__/packages/luca-framework/hooks-template.test.ts` passes (4 tests)
- `bun test` passes (all tests)

### Task 11: Final end-to-end verification

**Goal**: Run the complete build, verify all hooks, and confirm the init distribution works.

**File**: No file changes. Execution and verification.

**Details**:

```bash
# Build the framework
bun run build:all

# Verify all 5 hook scripts in .claude/hooks/
ls -la .claude/hooks/*.sh | wc -l
# Expected: 5

# Verify settings.json has all 4 events
bun -e "
  const s = JSON.parse(await Bun.file('.claude/settings.json').text());
  console.log('Hook events:', Object.keys(s.hooks).sort().join(', '));
  console.log('Total hooks:', Object.values(s.hooks).flat().reduce((n, g) => n + g.hooks.length, 0));
"
# Expected:
# Hook events: PostToolUse, PreToolUse, SessionEnd, Stop
# Total hooks: 5

# Verify config.json template has hooks section
bun -e "
  const c = JSON.parse(await Bun.file('packages/luca-framework/templates/framework/templates/config.json').text());
  console.log('Has hooks config:', 'hooks' in c);
  console.log('Hooks enabled:', c.hooks.enabled);
"
# Expected:
# Has hooks config: true
# Hooks enabled: true

# Verify template scripts exist
ls packages/luca-framework/templates/hooks/scripts/*.sh | wc -l
# Expected: 5

# Run all tests
bun test
# Expected: All pass

# Verify hook count in registry
bun -e "
  import { hookRegistry } from './src/hooks/index';
  console.log('Hook registry entries:', Object.keys(hookRegistry).length);
"
# Expected: Hook registry entries: 5
```

**Verification**:
- 5 hooks in `.claude/hooks/`, all executable
- settings.json has 4 event types, 5 total hooks
- config.json template includes `hooks` section
- 5 template scripts in `packages/luca-framework/templates/hooks/scripts/`
- All tests pass
- Hook registry has exactly 5 entries

## Exit Criteria

1. **HOOK-05**: `src/hooks/scripts/context-monitor.sh` exists and is valid bash. It reads transcript file size as a proxy for context usage. It outputs `systemMessage` warnings at three configurable threshold levels (WARN, HIGH, CRITICAL). It checks `stop_hook_active` to prevent infinite loops. After build, `.claude/hooks/context-monitor.sh` is executable. The hook fires on `Stop` events (no matcher).
2. **HOOK-06**: `src/hooks/scripts/session-persist.sh` exists and is valid bash. It appends a timestamp footer to `.planning/WORKING.md` on session end. It handles missing or empty WORKING.md gracefully. After build, `.claude/hooks/session-persist.sh` is executable. The hook fires on `SessionEnd` events.
3. **HOOK-08**: Hook scripts are distributable via `luca init`:
   - `packages/luca-framework/templates/hooks/scripts/` contains all 5 hook scripts
   - `packages/luca-framework/templates/hooks/settings-hooks.json` contains the full hooks configuration
   - `generateFiles()` in `packages/luca-framework/src/utils/files.ts` creates `.claude/hooks/`, copies scripts, makes them executable, and generates `.claude/settings.json`
   - `config.json` template includes a `hooks` section with configurable settings
   - Template hook scripts match `src/hooks/scripts/` counterparts (verified by tests)
4. The hook registry has exactly 5 entries covering 4 event types.
5. `bun run build:all` generates all 5 hooks + settings.json for the framework repo.
6. All tests pass (`bun test`), including hook registry tests and template tests.
7. `.claude/settings.json` has all 4 event types: PostToolUse (2 hooks), PreToolUse (1 hook), Stop (1 hook), SessionEnd (1 hook).
