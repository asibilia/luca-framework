# Plan 11-01: Hook Infrastructure, Post-Edit Formatter, and Hook/Skill Boundary

## Frontmatter
- **ID**: 11-01
- **Title**: Hook Infrastructure, Post-Edit Formatter, and Hook/Skill Boundary
- **Phase**: 11 (Hooks)
- **Wave**: 1
- **Depends on**: 10-02 (build pipeline must exist for hook compilation integration)
- **Delivers**: HOOK-01, HOOK-02, HOOK-07

## Objective

Establish the hook infrastructure (source directory, build pipeline integration, settings.json generation), implement the first concrete hook (post-edit auto-formatter), and document the hook/skill boundary as a rule. This plan creates the foundation all other hooks depend on while delivering immediate value through automatic formatting.

## Context

- `scripts/build-claude.ts` -- Existing build script that compiles agents, skills, and rules from `src/` to `.claude/`. Must be extended to also compile hooks (copy scripts + generate settings.json).
- `scripts/build-all.ts` -- Unified build script for both Cursor and Claude output. Must be extended to include hook compilation (Claude-only; hooks are not a Cursor feature).
- `scripts/build-utils.ts` -- Shared build utilities (`cleanDirectory`, `ensureDir`). Can be reused for hook output cleanup.
- `.claude/settings.local.json` -- Contains user-specific permissions. The build must NOT overwrite this file. Generated hooks go into `.claude/settings.json` (a separate file).
- `src/rules/general/bun-preference.rule.ts` -- Example rule class showing the `BaseRuleImpl` + `RuleConfig` pattern. The hook/skill boundary rule (HOOK-07) will follow this same pattern.
- `src/rules/index.ts` -- Rule registry. Must be updated to include the new hook-skill-boundary rule.
- `packages/luca-framework/templates/framework/templates/config.json` -- Framework config template. The `hooks` section will be added here in Wave 3 (HOOK-08), not this plan.
- `.planning/phases/11-hooks/RESEARCH.md` -- Section 1.3-1.5 detail hook configuration format, stdin JSON structure, and exit code semantics. Section 3.2 details the formatter hook approach. Section 4.7 confirms using `bun -e` instead of `jq` for JSON parsing.

### Key API Details (from Research)

**Hook configuration** lives in `.claude/settings.json` under the `hooks` key:
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
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**Hook stdin JSON** provides `tool_input.file_path` for PostToolUse events on Edit/Write tools. The script reads this to know which file was edited.

**Exit codes**: 0 = success (non-blocking for PostToolUse), 2 = block, other = non-blocking error.

**JSON parsing**: Use `bun -e` instead of `jq` (project convention per CLAUDE.md and Research section 4.7).

## Tasks

### Task 1: Create hook source directory structure

**Goal**: Create the `src/hooks/` directory with the scripts subdirectory and the hook registry index file. This establishes the source-of-truth location for all hook scripts.

**Files**: Create `src/hooks/scripts/` directory, create `src/hooks/index.ts`

**Details**:

Create the directory structure:
```
src/hooks/
  scripts/           # Shell scripts (source of truth)
    post-edit-format.sh   # Created in Task 3
  index.ts           # Hook registry (metadata for build pipeline)
```

Create `src/hooks/index.ts` with a hook registry that the build pipeline will consume. Unlike agent/skill/rule registries that map to class constructors, the hook registry maps hook names to metadata objects describing the hook configuration:

```ts
/**
 * Hook registry for the Luca Framework build pipeline.
 *
 * Unlike agent/skill/rule registries (which map to class constructors),
 * the hook registry maps hook names to metadata objects. The build script
 * uses this metadata to:
 * 1. Copy shell scripts from src/hooks/scripts/ to .claude/hooks/
 * 2. Generate the "hooks" section of .claude/settings.json
 *
 * Each entry defines:
 * - event: The Claude Code hook event name
 * - matcher: Regex pattern for tool matching (optional)
 * - script: Filename of the shell script in src/hooks/scripts/
 * - timeout: Max execution time in seconds
 * - async: Whether the hook runs in background
 */

export interface HookDefinition {
  /** Claude Code hook event name */
  event: string;
  /** Regex matcher for tool name filtering (undefined = always fire) */
  matcher?: string;
  /** Shell script filename in src/hooks/scripts/ */
  script: string;
  /** Timeout in seconds */
  timeout: number;
  /** Run asynchronously in background */
  async: boolean;
  /** Status message shown while hook runs */
  statusMessage?: string;
}

export const hookRegistry: Record<string, HookDefinition> = {
  'post-edit-format': {
    event: 'PostToolUse',
    matcher: 'Edit|Write',
    script: 'post-edit-format.sh',
    timeout: 10,
    async: false,
    statusMessage: 'Formatting...',
  },
};

/**
 * Generate the "hooks" section for .claude/settings.json
 * from the hook registry.
 */
export function generateHooksConfig(registry: Record<string, HookDefinition>): Record<string, unknown> {
  const config: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>> = {};

  for (const [_name, def] of Object.entries(registry)) {
    if (!config[def.event]) {
      config[def.event] = [];
    }

    // Find existing matcher group or create new one
    const matcherKey = def.matcher ?? '__no_matcher__';
    let group = config[def.event].find((g) => {
      if (matcherKey === '__no_matcher__') return !g.matcher;
      return g.matcher === def.matcher;
    });

    if (!group) {
      group = def.matcher ? { matcher: def.matcher, hooks: [] } : { hooks: [] };
      config[def.event].push(group);
    }

    const hookEntry: Record<string, unknown> = {
      type: 'command',
      command: `"$CLAUDE_PROJECT_DIR"/.claude/hooks/${def.script}`,
      timeout: def.timeout,
    };

    if (def.async) hookEntry.async = true;
    if (def.statusMessage) hookEntry.statusMessage = def.statusMessage;

    group.hooks.push(hookEntry);
  }

  return config;
}
```

**Verification**:
- `src/hooks/index.ts` compiles: `bun build src/hooks/index.ts --no-bundle`
- `hookRegistry` has exactly 1 entry (`post-edit-format`)
- `generateHooksConfig(hookRegistry)` produces a valid JSON structure with `PostToolUse` event

### Task 2: Integrate hooks into the build pipeline

**Goal**: Update `scripts/build-claude.ts` and `scripts/build-all.ts` to copy hook scripts from `src/hooks/scripts/` to `.claude/hooks/` and generate `.claude/settings.json` with the hooks configuration. The existing `.claude/settings.local.json` (permissions) must NOT be touched.

**Files**: Modify `scripts/build-claude.ts`, modify `scripts/build-all.ts`

**Details**:

Add the following to **both** build scripts, after the existing rules section and before the summary:

1. Import the hook registry and config generator:
```ts
import { hookRegistry, generateHooksConfig } from '../src/hooks/index';
```

2. Add hook compilation section:
```ts
// --- Hooks (Claude-only) ---

const hooksDir = path.join(claudeDir, 'hooks');
await ensureDir(hooksDir);

// Clean existing hook scripts
const removedHooks = await cleanDirectory(hooksDir, ['.sh']);
if (removedHooks.length) console.log(`Cleaned ${removedHooks.length} stale hook scripts`);

let hookCount = 0;

// Copy hook scripts from src/hooks/scripts/ to .claude/hooks/
const hookScriptsDir = path.join(process.cwd(), 'src', 'hooks', 'scripts');
for (const [hookName, hookDef] of Object.entries(hookRegistry)) {
  try {
    const srcPath = path.join(hookScriptsDir, hookDef.script);
    const destPath = path.join(hooksDir, hookDef.script);

    const srcFile = Bun.file(srcPath);
    if (!(await srcFile.exists())) {
      console.error(`✗ Hook script not found: src/hooks/scripts/${hookDef.script}`);
      continue;
    }

    await Bun.write(destPath, srcFile);

    // Make script executable
    const { exitCode } = Bun.spawnSync(['chmod', '+x', destPath]);
    if (exitCode !== 0) {
      console.error(`✗ Failed to chmod +x ${destPath}`);
    }

    console.log(`✓ Generated .claude/hooks/${hookDef.script}`);
    hookCount++;
  } catch (error) {
    console.error(`✗ Failed to generate .claude/hooks/${hookDef.script}:`, error);
  }
}

// Generate .claude/settings.json with hooks configuration
const settingsPath = path.join(claudeDir, 'settings.json');
let existingSettings: Record<string, unknown> = {};

// Preserve any existing settings (but NOT from settings.local.json)
try {
  const settingsFile = Bun.file(settingsPath);
  if (await settingsFile.exists()) {
    existingSettings = JSON.parse(await settingsFile.text());
  }
} catch {
  // File doesn't exist or is invalid JSON -- start fresh
}

// Merge hooks config into settings
const hooksConfig = generateHooksConfig(hookRegistry);
existingSettings.hooks = hooksConfig;

await Bun.write(settingsPath, JSON.stringify(existingSettings, null, 2) + '\n');
console.log(`✓ Generated .claude/settings.json with ${hookCount} hook(s)`);
```

3. Update the build summary to include hook count:
```ts
console.log(`Hooks:  ${hookCount} (Claude-only)`);
```

**For `build-all.ts` specifically**: The hook compilation section only runs for the Claude output path. Cursor does not support hooks, so no Cursor hook output is generated. Add a comment explaining this:
```ts
// Hooks are Claude Code-specific -- no Cursor equivalent
```

**Key decisions**:
- `.claude/settings.json` is a BUILD OUTPUT (generated file), separate from `.claude/settings.local.json` (user permissions)
- The build reads any existing `.claude/settings.json` to preserve non-hook keys, then overwrites the `hooks` key
- Scripts are copied as-is (not compiled) and made executable with `chmod +x`
- Hook count is included in the build summary

**Verification**:
- `bun run build:claude` completes without errors and outputs hook generation messages
- `.claude/hooks/post-edit-format.sh` exists and is executable (`ls -la .claude/hooks/`)
- `.claude/settings.json` exists and contains a valid `hooks.PostToolUse` section
- `.claude/settings.local.json` is unchanged (still contains only permissions)
- `bun run build:all` completes without errors and includes hook output

### Task 3: Create the post-edit formatter hook script

**Goal**: Create the shell script that runs a code formatter on the edited file after every Edit or Write tool call. This is the first concrete hook and proves the infrastructure works end-to-end.

**File**: Create `src/hooks/scripts/post-edit-format.sh`

**Details**:

```bash
#!/usr/bin/env bash
# post-edit-format.sh — Auto-format files after Edit/Write operations
#
# Hook event: PostToolUse (matcher: Edit|Write)
# Type: Command hook (synchronous)
# Timeout: 10 seconds
#
# Reads the edited file path from stdin JSON (tool_input.file_path),
# determines the appropriate formatter based on file extension, and
# runs it in-place. Non-blocking: exits 0 regardless of formatter outcome.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Extract file path using bun -e (no jq dependency)
FILE_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  // Edit tool uses tool_input.file_path, Write tool uses tool_input.file_path
  const filePath = data.tool_input?.file_path;
  if (filePath) process.stdout.write(filePath);
")

# Exit early if no file path extracted
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Exit early if file doesn't exist (was deleted or is a new path that failed)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Determine file extension
EXT="${FILE_PATH##*.}"

# Map extensions to formatter commands
# Only format extensions where auto-formatting adds value
case ".$EXT" in
  .ts|.tsx|.js|.jsx|.mjs|.cjs)
    # TypeScript/JavaScript — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .json)
    # JSON — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .css|.scss|.less)
    # Stylesheets — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .html|.htm)
    # HTML — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .md|.mdx)
    # Markdown — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  .yaml|.yml)
    # YAML — use Prettier
    bunx --bun prettier --write "$FILE_PATH" 2>/dev/null || true
    ;;
  *)
    # Unknown extension — skip formatting
    ;;
esac

# Always exit 0 — formatting is non-blocking feedback
exit 0
```

**Key decisions**:
- Uses `bun -e` for JSON parsing (no `jq` dependency, per project convention)
- Errors are suppressed (`2>/dev/null || true`) because formatting should never block editing
- Only formats known extensions (TypeScript, JavaScript, JSON, CSS, HTML, Markdown, YAML)
- Uses `bunx --bun prettier --write` for in-place formatting of a single file (fast)
- Shell files, Dockerfiles, and other non-formattable files are skipped
- Always exits 0 (PostToolUse hooks cannot block, but good practice)

**Verification**:
- Script is valid bash: `bash -n src/hooks/scripts/post-edit-format.sh`
- After build, `.claude/hooks/post-edit-format.sh` is executable: `test -x .claude/hooks/post-edit-format.sh`
- Manual test: `echo '{"tool_input":{"file_path":"src/hooks/index.ts"}}' | bash src/hooks/scripts/post-edit-format.sh` runs without error
- Verify formatter runs: Create a deliberately unformatted `.ts` file, pipe its path through the script, verify formatting was applied

### Task 4: Create the hook/skill boundary rule

**Goal**: Create a rule that documents when to use hooks versus skills. This rule is always-loaded (like other rules) and provides clear guidance for AI agents and human developers on the distinction between deterministic enforcement (hooks) and interactive workflows (skills).

**File**: Create `src/rules/general/hook-skill-boundary.rule.ts`

**Details**:

Follow the existing `BaseRuleImpl` + `RuleConfig` pattern from `bun-preference.rule.ts`:

```ts
/**
 * Hook/Skill boundary: when to use deterministic hooks vs interactive skills
 */
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

const HookSkillBoundaryConfig: RuleConfig = {
  frontmatter: {
    description: 'Hook/Skill boundary: when to use deterministic hooks vs interactive skills',
    globs: ['*.ts', '*.sh', '.claude/settings.json'],
    alwaysApply: true,
  },
  sections: [
    {
      title: 'rule',
      content: `# Hook/Skill Boundary

## Core Distinction

- **Hooks** = Deterministic enforcement. Always run. No judgment. Fast. Claude Code only.
- **Skills** = Interactive workflows. Run on demand. Require judgment. Can be slow. Cross-platform.

## Decision Matrix

| Question | Hook | Skill |
|----------|------|-------|
| Must it always run on every relevant action? | Yes | No |
| Does it need LLM judgment or reasoning? | No | Yes |
| Is it triggered by a tool event (Edit, Write, Bash)? | Yes | No |
| Is it triggered by a user command (/skill-name)? | No | Yes |
| Must it complete in < 2 seconds? | Yes | No |
| Does it involve multi-step reasoning? | No | Yes |
| Can Claude choose to skip it? | No (deterministic) | Yes (advisory) |
| Does it work in Cursor IDE? | No (Claude Code only) | Yes (cross-platform) |

## Current Hook/Skill Mapping

| Concern | Hook (automatic) | Skill (interactive) |
|---------|-----------------|-------------------|
| Code formatting | post-edit-format (PostToolUse) | -- |
| Type checking | post-edit-typecheck (PostToolUse, async) | code-typecheck |
| Pre-commit quality | pre-commit-gate (PreToolUse) | git-commit |
| Testing | pre-commit-gate (includes tests) | test-run |
| Linting | post-edit-format (includes lint) | code-lint |
| Context monitoring | context-monitor (Stop) | -- |
| Session persistence | session-persist (SessionEnd) | -- |

## Hook Types

- **Command hooks**: Shell scripts. Fastest. Use for file operations, tool invocation, exit code checks.
- **Prompt hooks**: Single-turn LLM evaluation. Use for judgment-based checks that need reasoning.
- **Agent hooks**: Subagent with tool access. Use for multi-step verification requiring file reads.

## When NOT to Use Hooks

- User-initiated workflows (discovery, planning, execution)
- Complex decision-making that requires context understanding
- Operations that need user confirmation or input
- Long-running processes (> 30 seconds) that would block editing
- Cursor IDE compatibility is required

## Platform Behavior

- **Claude Code**: Hooks provide deterministic enforcement. Skills remain available for interactive use.
- **Cursor IDE**: No hook equivalent. Skills provide advisory enforcement (AI remembers to check, but can skip).
- **Both**: Rules provide always-loaded instructions. Rules work on both platforms.`,
      order: 1,
    },
  ],
};

export class HookSkillBoundaryRule extends BaseRuleImpl {
  constructor() {
    super(HookSkillBoundaryConfig);
  }
}
```

**Verification**:
- File compiles: `bun build src/rules/general/hook-skill-boundary.rule.ts --no-bundle`
- Instantiation works: `new HookSkillBoundaryRule()` produces a valid instance with expected description

### Task 5: Register the hook/skill boundary rule

**Goal**: Add the new `HookSkillBoundaryRule` to the `ruleRegistry` in `src/rules/index.ts` so it is compiled by the build pipeline and distributed to `.claude/rules/` and `.cursor/rules/`.

**File**: Modify `src/rules/index.ts`

**Details**:

Add the import (in the unique class names section):
```ts
import { HookSkillBoundaryRule } from './general/hook-skill-boundary.rule';
```

Add the registry entry (in alphabetical order, after `functional-api-reuse`):
```ts
'hook-skill-boundary': HookSkillBoundaryRule,
```

The registry will now have 21 entries (up from 20).

**Verification**:
- `src/rules/index.ts` compiles without errors
- `Object.keys(ruleRegistry).length === 21`
- `bun run build:all` generates `.claude/rules/hook-skill-boundary.md` and `.cursor/rules/hook-skill-boundary.mdc`

### Task 6: Update root index.ts exports (if needed)

**Goal**: Ensure the hook registry is exported from the root `index.ts` for downstream consumers.

**File**: Modify `index.ts` (repository root)

**Details**:

Add after the existing registry exports:
```ts
// Hook registry and types (for build scripts and consumers)
export { hookRegistry, generateHooksConfig } from './src/hooks/index';
export type { HookDefinition } from './src/hooks/index';
```

**Verification**:
- Root `index.ts` compiles
- `import { hookRegistry } from './index'` resolves correctly

### Task 7: Run full build and verify end-to-end

**Goal**: Execute the complete build pipeline and verify all hook infrastructure is working.

**File**: No file changes. Execution and verification.

**Details**:

Run these commands in sequence:

```bash
# Build everything
bun run build:all

# Verify hook script was copied
ls -la .claude/hooks/post-edit-format.sh
# Should show: -rwxr-xr-x ... post-edit-format.sh

# Verify settings.json was generated with hooks
cat .claude/settings.json
# Should contain: "hooks": { "PostToolUse": [...] }

# Verify settings.local.json was NOT modified
cat .claude/settings.local.json
# Should still contain only "permissions": { ... }

# Verify the boundary rule was compiled
ls .claude/rules/hook-skill-boundary.md
ls .cursor/rules/hook-skill-boundary.mdc

# Verify rule registry count
bun -e "import { ruleRegistry } from './src/rules/index'; console.log(Object.keys(ruleRegistry).length)"
# Should output: 21

# Verify hook registry
bun -e "import { hookRegistry, generateHooksConfig } from './src/hooks/index'; console.log(JSON.stringify(generateHooksConfig(hookRegistry), null, 2))"
# Should output valid PostToolUse config

# Run existing tests to check for regressions
bun test

# Test the formatter script manually
echo '{"tool_input":{"file_path":"src/hooks/index.ts"}}' | bash src/hooks/scripts/post-edit-format.sh
echo $?
# Should output: 0
```

**Verification**:
- All commands succeed
- `.claude/hooks/post-edit-format.sh` exists and is executable
- `.claude/settings.json` has `hooks.PostToolUse` configuration
- `.claude/settings.local.json` is untouched
- `.claude/rules/hook-skill-boundary.md` exists
- `.cursor/rules/hook-skill-boundary.mdc` exists
- `bun test` passes (no regressions)

### Task 8: Update registry completeness tests

**Goal**: Update existing registry tests to account for the new rule (21 instead of 20).

**File**: Modify `__tests__/src/rules/rule-registry.test.ts`

**Details**:

Update the count assertion:
```ts
test('has exactly 21 entries', () => {
  expect(Object.keys(ruleRegistry).length).toBe(21);
});
```

Also add a new test file for the hook registry:

Create `__tests__/src/hooks/hook-registry.test.ts`:
```ts
import { describe, test, expect } from 'bun:test';
import { readdirSync } from 'fs';
import path from 'path';
import { hookRegistry, generateHooksConfig } from '../../../src/hooks/index';

const HOOK_SCRIPTS_DIR = path.join(import.meta.dir, '../../../src/hooks/scripts');

describe('hookRegistry', () => {
  test('every hook entry has a corresponding script file', () => {
    const scriptFiles = readdirSync(HOOK_SCRIPTS_DIR);
    for (const [name, def] of Object.entries(hookRegistry)) {
      expect(scriptFiles).toContain(def.script);
    }
  });

  test('generateHooksConfig produces valid structure', () => {
    const config = generateHooksConfig(hookRegistry);
    // Should have at least one event
    expect(Object.keys(config).length).toBeGreaterThan(0);

    // Each event should be an array of matcher groups
    for (const [event, groups] of Object.entries(config)) {
      expect(Array.isArray(groups)).toBe(true);
      for (const group of groups as Array<Record<string, unknown>>) {
        expect(group).toHaveProperty('hooks');
        expect(Array.isArray(group.hooks)).toBe(true);
      }
    }
  });

  test('all hook commands reference .claude/hooks/ path', () => {
    const config = generateHooksConfig(hookRegistry);
    for (const groups of Object.values(config)) {
      for (const group of groups as Array<{ hooks: Array<{ command: string }> }>) {
        for (const hook of group.hooks) {
          expect(hook.command).toContain('.claude/hooks/');
        }
      }
    }
  });
});
```

**Verification**:
- `bun test __tests__/src/rules/rule-registry.test.ts` passes with count = 21
- `bun test __tests__/src/hooks/hook-registry.test.ts` passes (3 tests)
- `bun test` passes (all tests)

## Exit Criteria

1. **HOOK-01**: `src/hooks/scripts/` directory exists with at least one script. `src/hooks/index.ts` exports `hookRegistry` and `generateHooksConfig`. `.claude/hooks/` is generated by the build pipeline. `.claude/settings.json` is generated with hooks configuration.
2. **HOOK-02**: `src/hooks/scripts/post-edit-format.sh` exists and is valid bash. After build, `.claude/hooks/post-edit-format.sh` is executable. The script reads `tool_input.file_path` from stdin JSON and runs Prettier on supported file types. The hook is configured in `.claude/settings.json` under `PostToolUse` with matcher `Edit|Write`.
3. **HOOK-07**: `src/rules/general/hook-skill-boundary.rule.ts` exists with a complete decision matrix. It is registered in `ruleRegistry` (count = 21). After build, `.claude/rules/hook-skill-boundary.md` and `.cursor/rules/hook-skill-boundary.mdc` exist.
4. Build pipeline generates hooks: `bun run build:claude` and `bun run build:all` copy hook scripts, generate settings.json, and report hook counts.
5. `.claude/settings.local.json` is never modified by the build.
6. All existing tests pass (`bun test`), with updated count expectations.
7. New hook registry tests pass (`__tests__/src/hooks/hook-registry.test.ts`).
