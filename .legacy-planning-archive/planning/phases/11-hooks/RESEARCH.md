# Phase 11: Hooks — Research

**Researched:** 2026-02-10
**Researcher:** lu-phase-researcher
**Phase Goal:** Implement deterministic quality gates using Claude Code hooks

---

## 1. Claude Code Hooks API

### 1.1 Overview

Claude Code hooks are user-defined shell commands, LLM prompts, or subagents that execute automatically at specific points in Claude Code's lifecycle. They provide **deterministic** control over behavior — actions that always happen rather than relying on the LLM to choose to run them.

Three hook types exist:
- **Command hooks** (`type: "command"`) — Run a shell command. Receive JSON on stdin, communicate via exit codes + stdout/stderr.
- **Prompt hooks** (`type: "prompt"`) — Single-turn LLM evaluation. Return `{ok: true/false, reason}`.
- **Agent hooks** (`type: "agent"`) — Spawn a subagent with tool access (Read, Grep, Glob) for multi-turn verification. Same response format as prompt hooks.

### 1.2 Available Events (14 Total)

| Event | When | Can Block? | Matcher Field |
|-------|------|------------|---------------|
| `SessionStart` | Session begins/resumes | No | source: `startup`, `resume`, `clear`, `compact` |
| `UserPromptSubmit` | User submits prompt | Yes | No matcher (always fires) |
| `PreToolUse` | Before tool executes | Yes (allow/deny/ask) | tool name: `Bash`, `Edit`, `Write`, etc. |
| `PermissionRequest` | Permission dialog shown | Yes | tool name |
| `PostToolUse` | After tool succeeds | No (feedback only) | tool name |
| `PostToolUseFailure` | After tool fails | No | tool name |
| `Notification` | Notification sent | No | type: `permission_prompt`, `idle_prompt`, etc. |
| `SubagentStart` | Subagent spawned | No | agent type |
| `SubagentStop` | Subagent finishes | Yes | agent type |
| `Stop` | Claude finishes responding | Yes (force continue) | No matcher (always fires) |
| `TeammateIdle` | Agent team member idle | Yes | No matcher |
| `TaskCompleted` | Task marked complete | Yes | No matcher |
| `PreCompact` | Before context compaction | No | trigger: `manual`, `auto` |
| `SessionEnd` | Session terminates | No | reason: `clear`, `logout`, `prompt_input_exit`, etc. |

### 1.3 Configuration Format

Hooks are defined in JSON settings files. The structure is:

```json
{
  "hooks": {
    "<EventName>": [
      {
        "matcher": "<regex pattern>",
        "hooks": [
          {
            "type": "command",
            "command": "shell-command-here",
            "timeout": 600,
            "async": false,
            "statusMessage": "Running checks..."
          }
        ]
      }
    ]
  }
}
```

### 1.4 Configuration Locations (Precedence)

| Location | Scope | Shareable |
|----------|-------|-----------|
| `~/.claude/settings.json` | All projects | No (user-local) |
| `.claude/settings.json` | Single project | Yes (commit to repo) |
| `.claude/settings.local.json` | Single project | No (gitignored) |
| Managed policy settings | Organization-wide | Yes (admin-controlled) |
| Plugin `hooks/hooks.json` | When plugin enabled | Yes (bundled) |
| Skill/agent frontmatter | While component active | Yes (in component) |

**Key insight**: Hooks defined in `.claude/settings.json` are the primary mechanism for project-level hooks that can be committed to a repository and distributed. This is directly relevant to `luca init`.

### 1.5 Hook Input (stdin JSON)

All hooks receive common fields:

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/path/to/project",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "/path/to/file.ts", "content": "..." },
  "tool_response": { "filePath": "/path/to/file.ts", "success": true }
}
```

Event-specific fields vary. For `PostToolUse`, we get `tool_input` and `tool_response`. For `Stop`, we get `stop_hook_active` (critical for preventing infinite loops).

### 1.6 Exit Codes

| Exit Code | Meaning | Effect |
|-----------|---------|--------|
| 0 | Success | Action proceeds. JSON on stdout parsed for decisions. |
| 2 | Block | Action blocked. Stderr fed to Claude as feedback. |
| Other | Non-blocking error | Stderr shown in verbose mode. Action proceeds. |

### 1.7 JSON Decision Control

Different events use different decision patterns:

| Events | Pattern | Key Fields |
|--------|---------|------------|
| PreToolUse | `hookSpecificOutput` | `permissionDecision` (allow/deny/ask), `permissionDecisionReason` |
| PostToolUse, Stop, SubagentStop | Top-level `decision` | `decision: "block"`, `reason` |
| PermissionRequest | `hookSpecificOutput` | `decision.behavior` (allow/deny) |
| TeammateIdle, TaskCompleted | Exit code only | Exit 2 = block, stderr = feedback |

### 1.8 Environment Variables

- `$CLAUDE_PROJECT_DIR` — Project root (use for referencing scripts)
- `$CLAUDE_ENV_FILE` — SessionStart only; write `export` statements to persist env vars
- `$CLAUDE_CODE_REMOTE` — `"true"` in web environments

### 1.9 Performance Characteristics

- **Default timeout**: 600 seconds (10 minutes) for command hooks, 30s for prompt hooks, 60s for agent hooks
- **Parallel execution**: All matching hooks run in parallel; identical commands deduplicated
- **Async hooks**: Set `"async": true` to run in background without blocking (results delivered next turn)
- **Hook loading**: Snapshot captured at session start; mid-session changes require `/hooks` review

### 1.10 Hooks in Skills and Agents (Frontmatter)

Skills and agents can define hooks in their YAML frontmatter. These hooks are scoped to the component's lifecycle:

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

The `once` field (skills only) runs a hook exactly once per session, then removes it.

---

## 2. Existing Codebase Analysis

### 2.1 Current State: Zero Hooks

- `.claude/settings.local.json` exists but contains **only permissions** — no hooks configured
- No `.claude/settings.json` exists (only `.claude/settings.local.json`)
- No `.claude/hooks/` directory exists
- No hook scripts exist anywhere in the repository

### 2.2 Hook-Related Code Already Present

The todo file `.planning/todos/done/hooks-as-deterministic-gates.md` documents the design intent comprehensively. Key findings from it:

1. Three hook types identified: shell hooks, prompt hooks, agent hooks
2. Target lifecycle events: `PreToolUse`, `PostToolUse`, `Notification`, `Stop`
3. Specific hooks planned: post-edit formatting, type-check, pre-commit gate, context monitor, WORKING.md persistence
4. Hook/skill boundary: "Hooks handle deterministic enforcement; skills handle interactive workflows"

### 2.3 Existing Skills That Overlap with Hook Concerns

| Skill | What It Does | Hook Replacement |
|-------|-------------|-----------------|
| `code-typecheck` | Advisory: "Run tsc when user asks" | Hook: Auto-run tsc after every `.ts` edit |
| `code-lint` | Advisory: "Run lint when user asks" | Hook: Auto-run lint after every file edit |
| `git-commit` | Advisory: "Run commit tool" | Hook: PreToolUse on Bash(git commit) to block if tests fail |
| `test-run` | Advisory: "Run tests when user asks" | Hook: Pre-commit gate runs tests automatically |

These skills remain useful for **interactive** use. Hooks add the **automatic** layer.

### 2.4 Build Pipeline Integration

The build pipeline (Phase 10) compiles from `src/` to `.claude/` and `.cursor/`:

- `scripts/build-claude.ts` — Generates `.claude/agents/`, `.claude/skills/`, `.claude/rules/`
- `scripts/build-cursor.ts` — Generates `.cursor/agents/`, `.cursor/skills/`, `.cursor/rules/`

Hooks will need a parallel path:
- Source: `src/hooks/` (hook script sources)
- Output: `.claude/hooks/` (executable scripts) + `.claude/settings.json` (hook configuration)
- The build script should generate the `hooks` section in `.claude/settings.json`

### 2.5 Template System for Distribution

The `luca init` command (`packages/luca-framework/src/commands/init.ts`) scaffolds:
- `.planning/` — Planning artifacts
- `.cursor/luca/` — Framework files (workflows, templates, references)
- `.cursor/agents/`, `.cursor/rules/`, `.cursor/skills/`

Currently does NOT scaffold:
- `.claude/settings.json` (hook configuration)
- `.claude/hooks/` (hook scripts)

For hooks to be distributable, `luca init` needs to also generate:
1. `.claude/hooks/` directory with hook scripts
2. `.claude/settings.json` with hook configuration
3. These should be project-configurable (different stacks need different hooks)

### 2.6 Plugin Packaging Synergy

The todo `.planning/todos/pending/claude-code-plugin-packaging.md` describes packaging Luca as a Claude Code plugin. Plugins have a `hooks/hooks.json` file that automatically merges with user/project hooks when the plugin is enabled. This is a future distribution channel that aligns perfectly with Phase 11 — the same hooks designed here could be bundled in a plugin later.

---

## 3. Implementation Approach

### HOOK-01: Hook Directory Structure

**Approach:** Create the hook infrastructure in both the source (`src/`) and output (`.claude/`) directories.

**Source structure:**
```
src/hooks/
  scripts/
    post-edit-format.sh       # PostToolUse: auto-format
    post-edit-typecheck.sh    # PostToolUse: type-check .ts files
    pre-commit-gate.sh        # PreToolUse: block commits with failures
    context-monitor.sh        # Stop: context usage warning
    session-persist.sh        # SessionEnd: save WORKING.md
    protect-files.sh          # PreToolUse: block writes to protected paths
  settings-hooks.json         # Hook configuration template
  index.ts                    # Hook registry (for build pipeline)
```

**Output structure:**
```
.claude/
  hooks/
    post-edit-format.sh
    post-edit-typecheck.sh
    pre-commit-gate.sh
    context-monitor.sh
    session-persist.sh
    protect-files.sh
  settings.json               # Contains "hooks" section + existing permissions
```

**Build integration:** `scripts/build-claude.ts` copies hook scripts to `.claude/hooks/`, generates `hooks` section in `.claude/settings.json`, and marks scripts executable.

### HOOK-02: Post-Edit Auto-Format

**Event:** `PostToolUse` with matcher `Edit|Write`
**Type:** Command hook
**Approach:**

```json
{
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
```

The script:
1. Read `tool_input.file_path` from stdin JSON
2. Determine formatter based on file extension (Prettier for JS/TS/CSS/HTML/JSON/MD, or configurable)
3. Run formatter on the file
4. Exit 0 (formatting is non-blocking)

**Performance consideration:** Must complete in < 2 seconds. Use `--write` flag (in-place) and target only the single edited file. Async mode could be used but would delay feedback.

**Stack configurability:** The formatter command should be configurable via `.planning/config.json`:
```json
{
  "hooks": {
    "formatter": "bunx prettier --write",
    "formatterExtensions": [".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md"]
  }
}
```

### HOOK-03: Post-Edit Type-Check

**Event:** `PostToolUse` with matcher `Edit|Write`
**Type:** Command hook (same matcher group as format, separate hook)
**Approach:**

```json
{
  "PostToolUse": [
    {
      "matcher": "Edit|Write",
      "hooks": [
        {
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-typecheck.sh",
          "timeout": 30,
          "async": true
        }
      ]
    }
  ]
}
```

The script:
1. Read `tool_input.file_path` from stdin JSON
2. Check if file is `.ts` or `.tsx` — exit 0 immediately if not
3. Run `bunx tsc --noEmit` (project-wide check, since types are project-wide)
4. If errors found, output `{"systemMessage": "Type errors found: ..."}` (async delivers feedback)
5. Exit 0

**Key design choice:** Use `async: true` because type-checking is slow (2-10 seconds). This lets Claude continue working while tsc runs, then receives feedback on the next turn. The alternative (synchronous) would block every edit for seconds, which violates the < 2 second performance target.

**Stack configurability:**
```json
{
  "hooks": {
    "typeChecker": "bunx tsc --noEmit",
    "typeCheckExtensions": [".ts", ".tsx"]
  }
}
```

### HOOK-04: Pre-Commit Quality Gate

**Event:** `PreToolUse` with matcher `Bash`
**Type:** Command hook
**Approach:**

This is the most complex hook. It intercepts Bash commands that look like commits and blocks them if quality checks fail.

```json
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [
        {
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-commit-gate.sh",
          "timeout": 120
        }
      ]
    }
  ]
}
```

The script:
1. Read `tool_input.command` from stdin JSON
2. Check if command matches a commit pattern (`git commit`, `bun run commit`, etc.)
3. If not a commit command, exit 0 immediately (no-op for non-commit commands)
4. Run quality checks:
   - `bun test` — Tests must pass
   - `bunx tsc --noEmit` — No type errors
   - Lint check (configurable)
5. If any check fails:
   - Output JSON with `permissionDecision: "deny"` and `permissionDecisionReason` containing the error output
6. If all pass: exit 0 (allow commit)

**Stack configurability:**
```json
{
  "hooks": {
    "preCommitChecks": ["bun test", "bunx tsc --noEmit"],
    "commitPatterns": ["git commit", "bun run commit"]
  }
}
```

**Important detail:** The matcher is `Bash` (not a more specific pattern), so the script must be fast for non-commit commands. The first check (is this a commit?) must be near-instant.

### HOOK-05: Context Usage Monitor

**Event:** `Stop` (fires when Claude finishes responding)
**Type:** Prompt hook or command hook
**Approach:**

This is the most constrained requirement. Claude Code does NOT expose context usage as a direct API or field in hook input data. The `Stop` hook receives `session_id`, `transcript_path`, `stop_hook_active`, but NOT context window usage percentage.

**Option A: Transcript-based estimation (Command hook)**
```json
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/context-monitor.sh",
          "timeout": 5
        }
      ]
    }
  ]
}
```

The script:
1. Read `transcript_path` from stdin
2. Count the size of the transcript file (approximate context usage)
3. Compare against configurable thresholds
4. If above threshold, output a `systemMessage` warning

**Limitation:** Transcript file size is a rough proxy for context usage, not an exact measurement. The actual token count depends on model, compaction state, and other factors.

**Option B: Prompt-based estimation (Prompt hook)**
```json
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "prompt",
          "prompt": "Estimate the context usage level of this conversation based on the transcript length and content. If it appears to be above 50% capacity, respond {\"ok\": false, \"reason\": \"Context usage is high (~X%). Consider running /compact to free context window space.\"}. If usage appears manageable, respond {\"ok\": true}. Transcript: $ARGUMENTS"
        }
      ]
    }
  ]
}
```

**Recommendation:** Use Option A (command hook) with transcript file size as proxy. It is faster, deterministic, and avoids LLM cost per stop. Document the limitation clearly. Configure thresholds in `.planning/config.json`:

```json
{
  "hooks": {
    "contextThresholds": {
      "warn": 100000,
      "alert": 200000,
      "suggest_compact": 300000
    }
  }
}
```

Note: These byte thresholds are approximations. They should be tuned based on real-world usage.

### HOOK-06: Session Persistence (WORKING.md)

**Event:** `SessionEnd`
**Type:** Command hook
**Approach:**

```json
{
  "SessionEnd": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-persist.sh",
          "timeout": 10
        }
      ]
    }
  ]
}
```

The script:
1. Check if `.planning/WORKING.md` exists
2. If it exists and has content, add a timestamp footer: `\n\n---\n*Session ended: <timestamp>*\n`
3. Optionally, copy key session info to WORKING.md backup
4. Exit 0

**Important limitation:** `SessionEnd` hooks cannot block session termination. They perform cleanup only. The `Stop` hook CAN block (force continue), but `Stop` fires when Claude finishes responding, not when the user exits. For best coverage, we should use BOTH:
- `Stop` hook: Check if WORKING.md was updated in this session (agent-based). If not, block and request Claude save session state.
- `SessionEnd` hook: Final cleanup, timestamp footer.

**Alternative (more reliable):** Use an agent-based `Stop` hook that verifies WORKING.md was updated:

```json
{
  "Stop": [
    {
      "hooks": [
        {
          "type": "agent",
          "prompt": "Check if .planning/WORKING.md has been updated during this session with current task context and findings. If it has not been updated, respond {\"ok\": false, \"reason\": \"Save current session state to .planning/WORKING.md before stopping.\"}. If it has been updated, respond {\"ok\": true}.",
          "timeout": 30
        }
      ]
    }
  ]
}
```

**Recommendation:** Implement both. The agent-based Stop hook ensures WORKING.md gets saved during workflow execution. The SessionEnd command hook adds a final timestamp. This is belt-and-suspenders.

**Caveat for Stop hook:** Must check `stop_hook_active` to prevent infinite loops. The agent hook handles this automatically since it returns `{ok: true}` when satisfied.

### HOOK-07: Hook/Skill Boundary Documentation

**Approach:** This is a documentation deliverable, not code. Create a reference document that:

1. Defines the boundary:
   - **Hooks** = Deterministic enforcement. Always run. No judgment. Fast.
   - **Skills** = Interactive workflows. Run on demand. Require judgment. Can be slow.
2. Provides the decision matrix:

| Question | If Yes → Hook | If Yes → Skill |
|----------|--------------|----------------|
| Must it always run? | Hook | |
| Does it need LLM judgment? | | Skill |
| Is it triggered by a tool event? | Hook | |
| Is it triggered by user command? | | Skill |
| Must it complete in < 2 seconds? | Hook | |
| Does it involve multi-step reasoning? | | Skill |
| Can Claude ignore it? | | Skill (advisory) |
| Must Claude obey it? | Hook (deterministic) | |

3. Maps existing skills to hooks (from section 2.3 above)
4. Documents when to use prompt/agent hooks vs command hooks

**Deliverable:** `.claude/rules/hook-skill-boundary.md` (a rule, since it is an always-loaded instruction) + reference doc in templates.

### HOOK-08: Distributable via luca init

**Approach:** Extend the `luca init` template system to include hooks.

Changes needed:

1. **New template directory:** `packages/luca-framework/templates/hooks/`
   - Contains hook script templates with configurable commands
   - Contains `settings-hooks.json` template with hook configuration

2. **Update `generateFiles()`** in `packages/luca-framework/src/utils/files.ts`:
   - Create `.claude/hooks/` directory
   - Copy hook scripts from templates
   - Make scripts executable (`chmod +x`)
   - Generate `.claude/settings.json` with hooks section
   - Merge with any existing `.claude/settings.json` content

3. **Stack-specific hook configuration:**
   - `react-ts` stack: Prettier formatter, tsc type-checker, bun test
   - `custom` stack: Prompt user for formatter/checker commands
   - Configuration stored in `.planning/config.json` under `hooks` key

4. **Update template index:**
   - `packages/luca-framework/templates/framework/index.json` should list hooks

5. **Existing settings preservation:**
   - `luca init` must NOT overwrite existing `.claude/settings.json` or `.claude/settings.local.json`
   - It should MERGE the hooks section into existing settings
   - Or create `.claude/settings.json` if it doesn't exist

---

## 4. Risks and Constraints

### 4.1 Performance Risk: Post-Edit Hook Latency

**Risk:** Formatter and type-checker hooks run on every Edit/Write, adding latency to every file change.

**Mitigation:**
- Formatter hook: Should be synchronous but fast (< 1 second for Prettier on a single file)
- Type-checker hook: Must be async (`"async": true`) because tsc takes 2-10+ seconds
- File extension filtering in scripts: Skip non-relevant files immediately
- Timeout: Set tight timeouts (10s formatter, 30s typecheck)

### 4.2 Performance Risk: Pre-Commit Gate Duration

**Risk:** Running full test suite + tsc + lint before every commit takes 30-120 seconds.

**Mitigation:**
- Only run on commit commands (fast exit for non-commit Bash calls)
- Consider running tests in parallel: `bun test & bunx tsc --noEmit & wait`
- Make checks configurable (projects can skip slow checks)
- Set reasonable timeout (120s) with clear feedback on what's running

### 4.3 Constraint: Context Usage Not Directly Available

**Risk:** HOOK-05 requires context usage monitoring, but Claude Code hooks do NOT receive context usage percentage in their input data.

**Mitigation:**
- Use transcript file size as proxy (imperfect but functional)
- Document the limitation clearly
- This may improve in future Claude Code versions
- Alternative: Use `PreCompact` event as a signal (fires when context is actually full)

### 4.4 Constraint: SessionEnd Cannot Block

**Risk:** HOOK-06 requires saving WORKING.md on session stop, but `SessionEnd` hooks cannot prevent the session from ending.

**Mitigation:**
- Use `Stop` hook (which CAN block) to enforce WORKING.md updates during workflow
- Use `SessionEnd` for best-effort cleanup (timestamp footer)
- The `Stop` agent hook is the reliable enforcement layer

### 4.5 Risk: Stack Diversity

**Risk:** Not all downstream projects use TypeScript, bun test, or Prettier. Hook scripts assume specific toolchains.

**Mitigation:**
- Make all tool commands configurable via `.planning/config.json`
- Default to Bun/TypeScript/Prettier (project convention)
- Provide clear documentation for customizing hooks per stack
- Stack templates in `luca init` should set appropriate defaults

### 4.6 Risk: Stop Hook Infinite Loops

**Risk:** Stop hooks that always return `"block"` create infinite loops.

**Mitigation:**
- Check `stop_hook_active` field in all Stop hooks
- Agent/prompt hooks handle this naturally (they return `{ok: true}` once satisfied)
- Command-based Stop hooks MUST check this flag
- Document this prominently

### 4.7 Risk: jq Dependency

**Risk:** Many hook examples use `jq` for JSON parsing. Not all systems have `jq` installed.

**Mitigation:**
- Use `bun -e` for JSON parsing instead of `jq` (Bun is already a dependency)
- Example: `echo "$INPUT" | bun -e "const data = JSON.parse(await Bun.stdin.text()); console.log(data.tool_input.file_path)"`
- Or ship a tiny JSON extraction utility as part of the hook scripts
- This aligns with the CLAUDE.md directive to prefer Bun

### 4.8 Constraint: Cursor IDE Compatibility

**Risk:** Hooks are a Claude Code feature. Cursor IDE does not have an equivalent hook system.

**Mitigation:**
- Hooks are Claude Code-only; this is acceptable since the project supports both platforms
- For Cursor, the existing skill-based advisory approach continues
- Document that hooks provide deterministic enforcement in Claude Code but not Cursor
- The hook/skill boundary doc (HOOK-07) should address this explicitly

### 4.9 Risk: Settings.json Merge Conflicts

**Risk:** `.claude/settings.json` contains both hooks and permissions. Build scripts and `luca init` must not overwrite user permissions when updating hooks.

**Mitigation:**
- Build scripts should read existing settings.json, merge hooks section, and write back
- Never overwrite the `permissions` key
- Use `.claude/settings.local.json` for user-specific overrides (already gitignored)

---

## 5. Recommendations

### 5.1 Suggested Wave Organization

**Wave 1: Infrastructure + Core Hooks (HOOK-01, HOOK-02, HOOK-07)**
- Create hook directory structure and build pipeline integration
- Implement post-edit formatter (simplest, most visible hook)
- Document hook/skill boundary (foundational for all other hooks)
- Verifiable: Hook directory exists, formatter runs after Edit/Write, boundary doc reviewed

**Wave 2: Type-Checking + Pre-Commit Gate (HOOK-03, HOOK-04)**
- Implement async post-edit type-checker
- Implement pre-commit quality gate (the highest-value hook)
- Verifiable: Type errors reported after .ts edits, commits blocked when tests fail

**Wave 3: Monitoring + Persistence + Distribution (HOOK-05, HOOK-06, HOOK-08)**
- Implement context usage monitor (transcript-based)
- Implement WORKING.md persistence (Stop + SessionEnd)
- Integrate hooks into luca init templates
- Verifiable: Context warnings appear, WORKING.md saved on stop, fresh luca init project has hooks

### 5.2 Key Design Decisions to Make During Planning

1. **Bun vs jq for JSON parsing in hook scripts** — Recommend Bun (`bun -e`) for consistency with project conventions and to avoid external dependency.

2. **Sync vs async for type-checker** — Recommend async. Synchronous type-checking would block every edit for seconds, which is unacceptable UX.

3. **Where to store hook configuration** — Recommend `.planning/config.json` (existing config file) with a new `hooks` section. This keeps configuration centralized.

4. **settings.json generation** — The build script should generate `.claude/settings.json` with the hooks section. This file should be committed to the repo (not gitignored), since it contains shareable project-level hook configuration.

5. **Stop hook type for WORKING.md** — Recommend agent-based hook. It can inspect file state to verify WORKING.md was updated, which a command hook cannot easily do without fragile timestamp comparisons.

6. **Pre-commit gate scope** — Recommend matching all Bash commands with fast early-exit for non-commit patterns. The alternative (using Bash argument matchers like `Bash(git commit*)`) is less reliable because commit commands vary (`git commit`, `bun run commit`, etc.).

### 5.3 Testing Strategy

1. **Hook script unit tests:** Test each script with mocked stdin JSON. Verify exit codes and stdout/stderr output.
2. **Integration tests:** Run Claude Code with hooks configured, perform edit operations, verify hooks fire.
3. **Performance benchmarks:** Measure time from Edit/Write to formatter completion. Target < 2 seconds.
4. **Template tests:** Run `luca init`, verify hooks directory and settings.json are generated correctly.

### 5.4 Files to Create/Modify

**New files:**
- `src/hooks/scripts/post-edit-format.sh`
- `src/hooks/scripts/post-edit-typecheck.sh`
- `src/hooks/scripts/pre-commit-gate.sh`
- `src/hooks/scripts/context-monitor.sh`
- `src/hooks/scripts/session-persist.sh`
- `src/hooks/index.ts` (hook registry)
- `.claude/hooks/` (generated output directory)
- `.claude/settings.json` (generated, contains hooks + permissions)
- `packages/luca-framework/templates/hooks/` (luca init templates)

**Modified files:**
- `scripts/build-claude.ts` — Add hook compilation step
- `scripts/build-all.ts` — Include hook compilation
- `packages/luca-framework/src/utils/files.ts` — Generate hooks during init
- `packages/luca-framework/templates/framework/index.json` — Add hooks to contents
- `packages/luca-framework/templates/base/.planning/config.json` — Add hooks config section
- `src/rules/general/` — Add hook-skill-boundary rule (HOOK-07)

**Documentation:**
- Hook/skill boundary reference (HOOK-07)
- Hook configuration guide for downstream projects

### 5.5 Dependencies and Prerequisites

- Phase 10 (Build Pipeline) is complete — hooks can be compiled through the same pipeline
- `jq` or `bun -e` must be available in the runtime environment
- Claude Code must be the active CLI (hooks are Claude Code-specific)
- Existing `.claude/settings.local.json` permissions must be preserved during settings.json generation

### 5.6 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Post-edit hook latency | < 2 seconds (formatter) | Benchmark with `time` |
| Pre-commit gate reliability | 100% catch rate for test failures | Run failing tests, attempt commit |
| Hook compilation | All hooks generated by `bun run build:claude` | Build output check |
| luca init distribution | Hooks present in fresh project | Run init, inspect output |
| Zero false blocks | No legitimate commits blocked | Manual testing |

---

## Sources

- [Claude Code Hooks Guide](https://code.claude.com/docs/en/hooks-guide)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Claude Code Hooks Configuration Blog](https://claude.com/blog/how-to-configure-hooks)
- [Claude Code Hooks Mastery (GitHub)](https://github.com/disler/claude-code-hooks-mastery)
- Existing codebase analysis: `.planning/todos/done/hooks-as-deterministic-gates.md`
- Existing codebase analysis: `.planning/research/ARCHITECTURE.md` (Pattern 7: Hook-Based Extensibility)

---

*Research completed: 2026-02-10*
