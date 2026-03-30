# Phase 0 Validation

Test prompts to empirically validate Agent() sub-agent capabilities before migration begins. Run these AFTER `bun run build:all` has regenerated hook settings with `"Skill|Agent"` matchers.

---

## Test 1: Agent() PreToolUse Hook Firing

**Purpose:** Confirm enforcement hooks fire for Agent() tool calls (not just Skill()).

**Prompt:**

```
Agent(
  name: "test-ping",
  description: "Validate hook firing",
  prompt: "Say 'Hello from test-ping agent' and then output exactly:\nSTATUS: success\nRESULT: Hook validation complete"
)
```

**Pass criteria:**

- The Agent() call executes without being blocked
- If any pre-step hook has logging enabled, the log shows the hook fired for tool_name "Agent"
- The agent returns text containing "STATUS: success"

**Fail criteria:**

- Agent() call is silently ignored (no sub-agent spawned)
- Hook fires but cannot extract agent name (error in hook stderr)

---

## Test 2: Sub-Agent File System Access

**Purpose:** Confirm Agent() sub-agents can read/write files in the project directory and `/tmp/`.

**Prompt:**

```
Agent(
  name: "test-file-access",
  description: "Validate file access",
  prompt: "Do these 3 things and report results:\n1. Write the string 'AGENT_FILE_OK' to /tmp/agent-test-output.txt using the Write tool\n2. Read the file .planning/config.json using the Read tool and report the first line\n3. Output exactly:\nSTATUS: success\nRESULT: file_write=OK, config_read=OK"
)
```

**After the agent completes, verify:**

```bash
cat /tmp/agent-test-output.txt
# Expected: AGENT_FILE_OK
```

**Pass criteria:**

- `/tmp/agent-test-output.txt` contains "AGENT_FILE_OK"
- Agent successfully read `.planning/config.json`
- Agent returned STATUS: success

**Fail criteria:**

- File not created (sub-agent file writes silently fail — see RISK-A4, issue #13890)
- Agent cannot read project files (sandbox restriction)

**Cleanup:**

```bash
rm -f /tmp/agent-test-output.txt
```

---

## Test 3: Sub-Agent MuninnDB MCP Access

**Purpose:** Confirm Agent() sub-agents can call MuninnDB MCP tools.

**Prompt:**

```
Agent(
  name: "test-muninn",
  description: "Validate MuninnDB access",
  prompt: "Do these 2 things:\n1. Call mcp__muninn__muninn_recall(vault: 'luca-framework', context: ['project identity', 'brain project']) and note how many results you get\n2. Output exactly:\nSTATUS: success\nRESULT: recall_count={N} where {N} is the number of results returned"
)
```

**Pass criteria:**

- Agent returns STATUS: success with recall_count > 0 (the vault has 180+ memories)
- No MCP tool errors in agent output

**Fail criteria:**

- MCP tool call errors (MuninnDB server not accessible from sub-agent)
- recall_count = 0 (MuninnDB accessible but returns nothing — check vault name)
- Agent reports "tool not available" (MCP tools not forwarded to sub-agents)

---

## Gate Decision

**All 3 tests must pass** before proceeding to Wave 2. If any test fails:

| Failure                    | Action                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Test 1 (hooks don't fire)  | Verify `bun run build:all` was run. Check `.claude/settings.json` for `"Skill\|Agent"` matchers.            |
| Test 2 (file access fails) | Check Claude Code version. Issue #13890 documented silent MCP/file failures in v2.0.68.                     |
| Test 3 (MuninnDB fails)    | Verify MuninnDB server is running. Check if sub-agents have MCP tool access in current Claude Code version. |
