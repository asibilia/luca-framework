# Claude Code API Reference (March 2026)

Research gathered 2026-03-31 for Luca workflow redesign.

---

## 1. Hook System

### 1.1 All Hook Events (23 total)

Our codebase currently tracks 19 canonical events. The official docs now list **23 events**.

| Event                | Blockable | Matcher                                                                            | Status in Luca                                    |
| -------------------- | --------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| `SessionStart`       | No        | `startup`, `resume`, `clear`, `compact`                                            | ACTIVE                                            |
| `UserPromptSubmit`   | Yes       | None                                                                               | ACTIVE                                            |
| `PreToolUse`         | Yes       | Tool name (regex)                                                                  | ACTIVE                                            |
| `PermissionRequest`  | Yes       | Tool name                                                                          | NEW -- not in our registry                        |
| `PostToolUse`        | No        | Tool name (regex)                                                                  | ACTIVE                                            |
| `PostToolUseFailure` | No        | Tool name                                                                          | ACTIVE                                            |
| `Notification`       | No        | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`           | In registry (forward-compat)                      |
| `SubagentStart`      | No        | Agent type name                                                                    | In registry (forward-compat)                      |
| `SubagentStop`       | Yes       | Agent type name                                                                    | ACTIVE                                            |
| `TaskCreated`        | Yes       | None                                                                               | NEW -- not in our registry                        |
| `TaskCompleted`      | Yes       | None                                                                               | NEW -- not in our registry (was `task_completed`) |
| `Stop`               | Yes       | None                                                                               | ACTIVE                                            |
| `StopFailure`        | No        | `rate_limit`, `authentication_failed`, `billing_error`, etc.                       | NEW -- not in our registry                        |
| `TeammateIdle`       | Yes       | None                                                                               | In registry (forward-compat, as `teammate_idle`)  |
| `InstructionsLoaded` | No        | `session_start`, `nested_traversal`, `path_glob_match`, `include`, `compact`       | In registry (forward-compat)                      |
| `ConfigChange`       | Yes       | `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills` | In registry (forward-compat)                      |
| `CwdChanged`         | No        | None                                                                               | NEW -- not in our registry                        |
| `FileChanged`        | No        | Filename (basename)                                                                | NEW -- not in our registry                        |
| `WorktreeCreate`     | Yes       | None                                                                               | In registry (forward-compat)                      |
| `WorktreeRemove`     | No        | None                                                                               | In registry (forward-compat)                      |
| `PreCompact`         | No        | `manual`, `auto`                                                                   | ACTIVE                                            |
| `PostCompact`        | No        | `manual`, `auto`                                                                   | NEW -- not in our registry                        |
| `Elicitation`        | Yes       | MCP server name                                                                    | NEW -- not in our registry                        |
| `ElicitationResult`  | Yes       | MCP server name                                                                    | NEW -- not in our registry                        |

**Delta from our registry:** 7 new events need adding: `PermissionRequest`, `TaskCreated`, `StopFailure`, `CwdChanged`, `FileChanged`, `PostCompact`, `Elicitation`, `ElicitationResult` (8 total). Our `task_completed` maps to `TaskCompleted` but `TaskCreated` is new.

### 1.2 Hook Types (4 types)

| Type      | Description                        | Luca Support        |
| --------- | ---------------------------------- | ------------------- |
| `command` | Shell script                       | Yes (primary)       |
| `http`    | POST to URL endpoint               | No (new)            |
| `prompt`  | Single-turn LLM evaluation         | Planned (in schema) |
| `agent`   | Subagent with Read/Grep/Glob tools | Planned (in schema) |

**HTTP hooks** are new. They accept headers with env var interpolation, use HTTP status codes instead of exit codes, and return JSON responses. Relevant for remote/webhook-based enforcement.

### 1.3 Hook Configuration Schema

```jsonc
{
  "hooks": {
    "EventName": [
      {
        "matcher": "regex_pattern", // Regex against tool_name/source/etc.
        "hooks": [
          {
            "type": "command|http|prompt|agent",
            "command": "script.sh", // command type
            "url": "http://...", // http type
            "prompt": "...", // prompt/agent type
            "model": "fast-model", // prompt/agent type
            "headers": {}, // http type
            "allowedEnvVars": [], // http type
            "if": "ToolName(pattern)", // NEW: permission rule syntax filter
            "timeout": 600, // seconds (defaults vary by type)
            "async": false, // command type only
            "shell": "bash", // command type only
            "statusMessage": "...",
            "once": false, // NEW: runs once per session (skills only)
          },
        ],
      },
    ],
  },
  "disableAllHooks": false, // NEW: global kill switch
}
```

**New fields since our last update:**

- `if`: Permission rule syntax for fine-grained tool filtering (e.g., `Bash(rm *)`)
- `once`: Run hook once per session (skills/agents only)
- `shell`: Explicit shell selection (`bash` or `powershell`)
- `disableAllHooks`: Global disable flag
- `type: "http"` with `url`, `headers`, `allowedEnvVars`

### 1.4 Exit Codes & Decision Control

Unchanged from what we use:

- **Exit 0**: Success, parse stdout JSON
- **Exit 2**: Blocking error, use stderr as feedback
- **Other**: Non-blocking error, continue

**PreToolUse JSON output** (most complex):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask",
    "permissionDecisionReason": "string",
    "updatedInput": {},
    "additionalContext": "string"
  }
}
```

**Common output fields** (all hooks):

```json
{
  "continue": true,
  "stopReason": "string",
  "suppressOutput": false,
  "systemMessage": "string"
}
```

### 1.5 Environment Variables Available to Hooks

| Variable              | Scope                                 | Notes                                         |
| --------------------- | ------------------------------------- | --------------------------------------------- |
| `$CLAUDE_PROJECT_DIR` | All hooks                             | Project root                                  |
| `$CLAUDE_PLUGIN_ROOT` | Plugin hooks                          | Plugin install dir                            |
| `$CLAUDE_PLUGIN_DATA` | Plugin hooks                          | Plugin data dir                               |
| `$CLAUDE_CODE_REMOTE` | All hooks                             | `"true"` in remote web                        |
| `$CLAUDE_ENV_FILE`    | SessionStart, CwdChanged, FileChanged | Write `export` statements to persist env vars |

`$CLAUDE_ENV_FILE` is new and important: hooks can persist env vars across the session by writing to this file.

### 1.6 Hook Input (stdin JSON)

Common fields on all hook events:

```json
{
  "session_id": "string",
  "transcript_path": "string",
  "cwd": "string",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "hook_event_name": "string",
  "agent_id": "string",
  "agent_type": "string"
}
```

---

## 2. Subagent / Agent Tool

### 2.1 Agent Tool Input Schema

When Claude invokes a subagent via the `Agent` tool:

```json
{
  "tool_name": "Agent",
  "tool_input": {
    "prompt": "string",
    "description": "string (optional)",
    "subagent_type": "Explore|Bash|Plan|custom-name",
    "model": "sonnet|opus|haiku|inherit|claude-opus-4-6"
  }
}
```

**Key points:**

- `subagent_type`: References a named subagent definition (built-in or custom)
- `model`: Can be alias (`sonnet`, `opus`, `haiku`), full ID (`claude-opus-4-6`), or `inherit`
- The `Task` tool was renamed to `Agent` in v2.1.63. `Task(...)` still works as alias.

### 2.2 Subagent Definition Format (YAML Frontmatter)

```yaml
---
name: agent-name # Required: kebab-case identifier
description: When to use this # Required: Claude reads this to decide delegation
tools: Read, Grep, Glob, Bash # Optional: tool allowlist (inherits all if omitted)
disallowedTools: Write, Edit # Optional: tool denylist
model: sonnet # Optional: alias, full ID, or "inherit" (default: inherit)
permissionMode: default # Optional: default|acceptEdits|dontAsk|bypassPermissions|plan
maxTurns: 20 # Optional: max agentic turns
skills: # Optional: preload skill content into context
  - skill-name
mcpServers: # Optional: MCP servers scoped to this subagent
  - server-name
  - custom-server:
      type: stdio
      command: npx
      args: ["-y", "@some/mcp"]
hooks: # Optional: lifecycle hooks scoped to this subagent
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./validate.sh"
memory: user|project|local # Optional: persistent memory directory
background: false # Optional: always run in background
effort: low|medium|high|max # Optional: override session effort level
isolation: worktree # Optional: run in git worktree for isolation
initialPrompt: "..." # Optional: auto-submitted first turn (--agent mode)
---
System prompt content here (markdown body).
```

**New fields since our last schema review:**

- `disallowedTools`: Denylist (applied before `tools` allowlist)
- `skills`: Preload skill content into subagent context
- `mcpServers`: Scope MCP servers to subagent (inline or by reference)
- `memory`: Persistent memory across sessions (user/project/local scope)
- `background`: Force background execution
- `effort`: Override effort level (low/medium/high/max)
- `isolation`: `worktree` for git worktree isolation
- `initialPrompt`: Auto-submitted first turn for `--agent` mode
- `hooks`: Full hook configuration scoped to the subagent

### 2.3 Subagent Scope & Priority

| Location                   | Scope                | Priority    |
| -------------------------- | -------------------- | ----------- |
| `--agents` CLI flag (JSON) | Current session      | 1 (highest) |
| `.claude/agents/`          | Current project      | 2           |
| `~/.claude/agents/`        | All projects         | 3           |
| Plugin `agents/` dir       | Where plugin enabled | 4 (lowest)  |

### 2.4 Built-in Subagents

| Agent             | Model   | Tools     | Purpose                               |
| ----------------- | ------- | --------- | ------------------------------------- |
| Explore           | Haiku   | Read-only | Codebase search/analysis              |
| Plan              | Inherit | Read-only | Research for plan mode                |
| General-purpose   | Inherit | All       | Complex multi-step tasks              |
| Bash              | Inherit | Terminal  | Terminal commands in separate context |
| statusline-setup  | Sonnet  | -         | Configure statusline                  |
| Claude Code Guide | Haiku   | -         | Help with Claude Code features        |

### 2.5 Context & Output

- Each subagent gets a **fresh context window** (no parent conversation)
- Only channel from parent to subagent is the `prompt` string
- Output is returned to the orchestrator as the subagent's final response
- Subagents **cannot spawn other subagents** (no nesting)
- Subagents support auto-compaction at ~95% capacity
- Transcripts stored at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{id}.jsonl`

### 2.6 Model Resolution Order for Subagents

1. `CLAUDE_CODE_SUBAGENT_MODEL` environment variable (highest priority)
2. Per-invocation `model` parameter in Agent tool call
3. Subagent definition's `model` frontmatter field
4. Main conversation's model (inherit)

### 2.7 Agent Teams (Experimental)

Enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

Key tools:

- `TeamCreate`: Create a team of agents
- `TaskCreate`: Create tasks for teammates
- `SendMessage`: Direct messaging between teammates
- `TeamDelete`: Tear down a team

Differences from subagents:

- Teammates are **independent Claude Code processes** with full tool access
- Each teammate has its own context window
- Shared task list at `~/.claude/tasks/{team-name}/`
- Peer-to-peer messaging via SendMessage
- Support 2-16 agents per team
- Can use split-pane mode (tmux/iTerm2)

### 2.8 Restricting Subagent Spawning

In `tools` field: `Agent(worker, researcher)` -- allowlist of spawnable types.
In `permissions.deny`: `Agent(Explore)` -- block specific subagents.
Omitting `Agent` from `tools` entirely prevents all subagent spawning.

---

## 3. Model Identifiers

### 3.1 Current Models (March 2026)

| Family         | Model ID (API)              | Alias    | Context     | Max Output  | Notes                           |
| -------------- | --------------------------- | -------- | ----------- | ----------- | ------------------------------- |
| **Opus 4.6**   | `claude-opus-4-6`           | `opus`   | 1M tokens   | 128k tokens | Latest, most capable            |
| **Sonnet 4.6** | `claude-sonnet-4-6`         | `sonnet` | 1M tokens   | 64k tokens  | Best speed/intelligence balance |
| **Haiku 4.5**  | `claude-haiku-4-5-20251001` | `haiku`  | 200k tokens | 64k tokens  | Fastest, near-frontier          |

**Extended context:** `opus[1m]` and `sonnet[1m]` aliases enable 1M context. Also works as suffix: `claude-opus-4-6[1m]`.

### 3.2 Legacy Models (Still Available)

| Model ID                     | Alias               | Notes                                   |
| ---------------------------- | ------------------- | --------------------------------------- |
| `claude-sonnet-4-5-20250929` | `claude-sonnet-4-5` | Previous Sonnet generation              |
| `claude-opus-4-5-20251101`   | `claude-opus-4-5`   | Previous Opus generation                |
| `claude-opus-4-1-20250805`   | `claude-opus-4-1`   | Earlier Opus                            |
| `claude-sonnet-4-20250514`   | `claude-sonnet-4-0` | Claude 4 Sonnet                         |
| `claude-opus-4-20250514`     | `claude-opus-4-0`   | Claude 4 Opus                           |
| `claude-3-haiku-20240307`    | N/A                 | **Deprecated**, retiring April 19, 2026 |

### 3.3 Retired Models (Return Errors)

- `claude-3-7-sonnet-20250219` (Sonnet 3.7)
- `claude-3-5-haiku-20241022` (Haiku 3.5)

### 3.4 Model Aliases in Claude Code

| Alias        | Resolves To                                                   | Notes          |
| ------------ | ------------------------------------------------------------- | -------------- |
| `default`    | Opus 4.6 (Max/Team Premium) or Sonnet 4.6 (Pro/Team Standard) | Tier-dependent |
| `sonnet`     | Latest Sonnet (4.6)                                           |                |
| `opus`       | Latest Opus (4.6)                                             |                |
| `haiku`      | Latest Haiku (4.5)                                            |                |
| `sonnet[1m]` | Sonnet 4.6 with 1M context                                    |                |
| `opus[1m]`   | Opus 4.6 with 1M context                                      |                |
| `opusplan`   | Opus for plan mode, Sonnet for execution                      | Hybrid mode    |

### 3.5 Luca Model Routing Delta

Our current `MODEL_TIER_TO_MODEL` mapping in `src/complexity/__schemas/complexity.schemas.ts`:

```typescript
fast: "haiku"; // -> claude-haiku-4-5-20251001
balanced: "sonnet"; // -> claude-sonnet-4-6
capable: "opus"; // -> claude-opus-4-6
```

Our `ModelIdSchema` uses `z.enum(["opus", "sonnet", "haiku"])` which maps correctly to the current aliases. No change needed for the abstract tier mapping.

**Potential enhancement:** The `effort` level system (low/medium/high/max) is a new dimension we don't currently route. It could complement model tier selection -- e.g., use `sonnet` with `high` effort instead of `opus` with `medium` effort for certain agent categories.

### 3.6 Environment Variables for Model Control

| Variable                                | Purpose                                           |
| --------------------------------------- | ------------------------------------------------- |
| `ANTHROPIC_MODEL`                       | Override model for main session                   |
| `CLAUDE_CODE_SUBAGENT_MODEL`            | Override model for all subagents                  |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`          | Pin `opus` alias to specific model ID             |
| `ANTHROPIC_DEFAULT_SONNET_MODEL`        | Pin `sonnet` alias to specific model ID           |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`         | Pin `haiku` alias to specific model ID            |
| `CLAUDE_CODE_EFFORT_LEVEL`              | Override effort level (low/medium/high/max/auto)  |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | Revert to fixed thinking budget                   |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT`        | Disable 1M context variants                       |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`  | Disable background subagent execution             |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`       | Override auto-compaction threshold (default: 95%) |

---

## 4. Changes from What We Currently Use

### 4.1 Hook Events to Add to Registry

Add these to `CANONICAL_EVENTS` in `src/hooks/__schemas/hook.schemas.ts`:

```
"permission_request"   -> "PermissionRequest"
"task_created"         -> "TaskCreated"
"stop_failure"         -> "StopFailure"
"cwd_changed"          -> "CwdChanged"
"file_changed"         -> "FileChanged"
"post_compact"         -> "PostCompact"
"elicitation"          -> "Elicitation"
"elicitation_result"   -> "ElicitationResult"
```

Also rename/verify: our `task_completed` -> `TaskCompleted` (was `TaskCompleted` in docs).

### 4.2 Hook Configuration Fields to Add

- `if` field: Permission rule syntax for fine-grained filtering
- `once` field: Single-fire per session
- `shell` field: Explicit shell selection
- `type: "http"` with `url`, `headers`, `allowedEnvVars`
- `disableAllHooks` top-level setting
- `$CLAUDE_ENV_FILE` env var support in SessionStart/CwdChanged/FileChanged hooks

### 4.3 Subagent Fields to Track

New frontmatter fields not in our agent schema:

- `disallowedTools`
- `skills` (preload into context)
- `mcpServers` (scoped)
- `memory` (persistent across sessions)
- `background`
- `effort`
- `isolation` (worktree)
- `initialPrompt`
- `hooks` (scoped to subagent)

### 4.4 Model System Changes

- **Effort levels** (low/medium/high/max) are a new routing dimension
- `opusplan` alias for hybrid plan/execute model switching
- `[1m]` suffix for extended context
- `modelOverrides` setting for third-party provider ID mapping
- `availableModels` setting for enterprise model restriction
- `ANTHROPIC_CUSTOM_MODEL_OPTION` for custom model picker entries
- Prompt caching controls (`DISABLE_PROMPT_CACHING*`)

---

## 5. Official Documentation Links

- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Subagents documentation](https://code.claude.com/docs/en/sub-agents)
- [Agent teams](https://code.claude.com/docs/en/agent-teams)
- [Model configuration](https://code.claude.com/docs/en/model-config)
- [Models overview (API)](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Settings reference](https://code.claude.com/docs/en/settings)
- [Tools reference](https://code.claude.com/docs/en/tools-reference)
- [Skills documentation](https://code.claude.com/docs/en/skills)
- [Plugins documentation](https://code.claude.com/docs/en/plugins)
- [Claude Code full docs index](https://code.claude.com/docs/llms.txt)
