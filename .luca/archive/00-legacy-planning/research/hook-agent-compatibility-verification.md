# Hook Compatibility Verification: Skill vs Agent Tool for Anti-Skip Enforcement

Verification report for hook system compatibility with Agent() tool calls,
investigating whether Option B (replacing Skill() with Agent()) can maintain
anti-skip enforcement through the existing hook architecture.

**Research date:** 2026-03-29
**Branch:** 113--anti-skip-enforcement-layer

---

## Executive Summary

**Verdict: The Skill tool IS a valid tool in Claude Code.** The initial concern
that hooks matching on `tool_name === "Skill"` would break under Option B is
based on a misunderstanding. Both `Skill` and `Agent` are valid, separate tools
in Claude Code. They serve different purposes and fire independently in the hook
system. The enforcement hooks would need modification under Option B, but the
modification is straightforward.

---

## Finding 1: Skill IS a Valid Tool (HIGH Confidence)

**Source:** [Claude Code Tools Reference](https://code.claude.com/docs/en/tools-reference)

The official tools reference page explicitly lists `Skill` as a valid tool:

| Tool    | Description                                                    | Permission Required |
| ------- | -------------------------------------------------------------- | ------------------- |
| `Skill` | Executes a skill within the main conversation                  | Yes                 |
| `Agent` | Spawns a subagent with its own context window to handle a task | No                  |

The hooks documentation page at code.claude.com/docs/en/hooks lists `Agent` in its
matcher examples but omits `Skill` from that specific list. However, the tools
reference page is authoritative and includes both. The settings.json in this repo
already uses `"matcher": "Skill"` successfully, confirming runtime behavior matches
the tools reference.

**Confidence:** HIGH -- verified against official tools reference, confirmed by
production runtime behavior in this codebase.

---

## Finding 2: Matcher Syntax is Regex (HIGH Confidence)

**Source:** [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)

The matcher field is a **regex string** that filters when hooks fire:

- `"Bash"` -- exact match on tool_name
- `"Edit|Write"` -- regex OR, matches either tool
- `"Notebook.*"` -- regex wildcard, matches tools starting with "Notebook"
- `"mcp__memory__.*"` -- regex pattern for MCP tools
- `"*"`, `""`, or omit entirely -- match all tool calls

This means `"Skill|Agent"` is a valid matcher that would match BOTH tool types.
The existing `"Bash|Skill"` matcher on pre-step-enforcement already demonstrates
the pipe-separated regex pattern working in production.

**Confidence:** HIGH -- documented regex syntax, confirmed by existing usage in
settings.json with `"Bash|Skill"` pattern.

---

## Finding 3: tool_input Schema Differs Between Skill and Agent (HIGH Confidence)

**Source:** [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks),
[Sub-agents Documentation](https://code.claude.com/docs/en/sub-agents)

### Skill tool_input (current enforcement target)

```json
{
  "tool_name": "Skill",
  "tool_input": {
    "skill": "lu-route",
    "args": "some arguments"
  }
}
```

The enforcement hook factory reads:

- `tool_input.skill` -- the skill name (e.g., "lu-route")
- `tool_input.args` -- arguments passed to the skill (fallback for skill name extraction)

### Agent tool_input (Option B target)

```json
{
  "tool_name": "Agent",
  "tool_input": {
    "prompt": "Execute the lu-route workflow...",
    "description": "Route the request to the appropriate handler",
    "subagent_type": "lu-route",
    "model": "sonnet"
  }
}
```

Key fields:

- `tool_input.prompt` -- the full task prompt for the agent
- `tool_input.description` -- short description of the task
- `tool_input.subagent_type` -- the agent type/name (maps to .claude/agents/ definitions)
- `tool_input.model` -- optional model override

### Critical Difference for Enforcement

The current enforcement factory extracts the step identity from `tool_input.skill`.
Under Option B, the equivalent identity field would be `tool_input.subagent_type`.

**This is a clean 1:1 mapping:**

- Skill: `tool_input.skill === "lu-route"` -> enforce
- Agent: `tool_input.subagent_type === "lu-route"` -> enforce

**Confidence:** HIGH -- tool_input schemas from official docs, subagent_type
confirmed in multiple doc pages.

---

## Finding 4: SubagentStart and SubagentStop Events (HIGH Confidence)

**Source:** [Claude Code Sub-agents Documentation](https://code.claude.com/docs/en/sub-agents),
[Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)

### SubagentStart

```json
{
  "hook_event_name": "SubagentStart",
  "agent_id": "agent-abc123",
  "agent_type": "Explore"
}
```

- Fires AFTER PreToolUse allows the Agent call
- **Cannot block** subagent creation (already approved by PreToolUse)
- Matcher filters on `agent_type` (e.g., "Explore", "lu-route")
- Can inject context via `additionalContext` in JSON output
- Custom agent names from `.claude/agents/` appear as agent_type

### SubagentStop

```json
{
  "hook_event_name": "SubagentStop",
  "agent_id": "def456",
  "agent_type": "Explore",
  "agent_transcript_path": "~/.claude/projects/.../subagents/agent-def456.jsonl",
  "last_assistant_message": "Analysis complete..."
}
```

- Fires when subagent completes
- Matcher filters on `agent_type`
- **Can block** subagent from stopping (re-enters the subagent)
- This repo already has a SubagentStop hook (`subagent-stop.sh`)

### Hook Firing Sequence for Agent() Calls

1. **PreToolUse** fires with `tool_name: "Agent"` -- can allow/deny/modify
2. Agent spawns the subagent
3. **SubagentStart** fires -- can inject context, cannot block
4. Subagent runs (with its own internal tool events)
5. **SubagentStop** fires -- can block stop (re-enter)
6. **PostToolUse** fires -- receives results

### Implication for Enforcement

**PreToolUse is the correct enforcement point**, not SubagentStart. PreToolUse
can block the Agent call entirely (exit code 2 = deny), while SubagentStart
cannot block. This matches the current pattern where PreToolUse blocks invalid
Skill calls.

**Confidence:** HIGH -- hook firing sequence confirmed in official docs.

---

## Finding 5: Current Enforcement Architecture Analysis (HIGH Confidence)

**Source:** Direct code inspection of this repository.

### enforcement-hook-factory.ts (Line 172-173)

```typescript
// Step 2: Only act on Skill tool calls
if (toolName !== "Skill") {
  return exitSuccess();
}
```

This is the critical gate. The factory silently allows any non-Skill tool call.
Under Option B, this needs to become:

```typescript
if (toolName !== "Skill" && toolName !== "Agent") {
  return exitSuccess();
}
```

### Skill Name Extraction (Line 183-188)

```typescript
const toolInput = stdinData?.tool_input as Record<string, unknown> | undefined;
const skillName =
  (toolInput?.skill as string) ||
  ((toolInput?.args as string) || "").split(/\s+/)[0];
```

For Agent calls, this would need to also check `subagent_type`:

```typescript
const skillName =
  (toolInput?.skill as string) || // Skill() calls
  (toolInput?.subagent_type as string) || // Agent() calls
  ((toolInput?.args as string) || "").split(/\s+/)[0];
```

### settings.json Matchers (5 hooks affected)

Current matchers that reference "Skill":

1. `"matcher": "Bash|Skill"` -- pre-step-enforcement
2. `"matcher": "Skill"` -- pre-step-pr-address
3. `"matcher": "Skill"` -- pre-step-milestone-complete
4. `"matcher": "Skill"` -- pre-step-verify
5. `"matcher": "Skill"` -- pre-step-phase-execute
6. `"matcher": "Skill"` -- pre-step-lu

All would need to become `"Skill|Agent"` to intercept both tool types.

### hook-registry.ts (6 entries affected)

Current `tool_filter` values:

1. `"Bash|Skill"` -- pre-step-enforcement
2. `"Skill"` -- pre-step-pr-address
3. `"Skill"` -- pre-step-milestone-complete
4. `"Skill"` -- pre-step-verify
5. `"Skill"` -- pre-step-phase-execute
6. `"Skill"` -- pre-step-lu

All would need `"Skill|Agent"` for dual-tool support.

### pre-step-enforcement.ts (Line 93)

```typescript
if (toolName === "Skill" || toolName === "Bash")
```

Would need to add `"Agent"`:

```typescript
if (toolName === "Skill" || toolName === "Agent" || toolName === "Bash")
```

**Confidence:** HIGH -- direct source code inspection.

---

## Finding 6: Migration Strategy -- Dual Support (HIGH Confidence)

Both Skill and Agent tools can be supported simultaneously during migration.
This is the recommended approach.

### Changes Required

#### 1. enforcement-hook-factory.ts (2 changes)

**Change A -- Tool name gate (line 173):**

```typescript
// Before:
if (toolName !== "Skill") {
// After:
if (toolName !== "Skill" && toolName !== "Agent") {
```

**Change B -- Skill name extraction (lines 186-188):**

```typescript
// Before:
const skillName =
  (toolInput?.skill as string) ||
  ((toolInput?.args as string) || "").split(/\s+/)[0];

// After:
const skillName =
  (toolInput?.skill as string) || // Skill() calls
  (toolInput?.subagent_type as string) || // Agent() calls
  ((toolInput?.args as string) || "").split(/\s+/)[0];
```

#### 2. hook-registry.ts (6 changes)

All `tool_filter: "Skill"` entries become `tool_filter: "Skill|Agent"`:

- pre-step-enforcement: `"Bash|Skill"` -> `"Bash|Skill|Agent"`
- pre-step-pr-address: `"Skill"` -> `"Skill|Agent"`
- pre-step-milestone-complete: `"Skill"` -> `"Skill|Agent"`
- pre-step-verify: `"Skill"` -> `"Skill|Agent"`
- pre-step-phase-execute: `"Skill"` -> `"Skill|Agent"`
- pre-step-lu: `"Skill"` -> `"Skill|Agent"`

#### 3. pre-step-enforcement.ts (1 change)

```typescript
// Before:
if (toolName === "Skill" || toolName === "Bash")
// After:
if (toolName === "Skill" || toolName === "Agent" || toolName === "Bash")
```

#### 4. settings.json (auto-generated)

After changing hook-registry.ts and running `bun run build:all`, the settings.json
matchers will be updated automatically by the build pipeline.

### What Does NOT Need to Change

- **Context file paths** (`/tmp/lu-context.json`, etc.) -- unchanged
- **State machine logic** -- unchanged
- **Valid states mapping** -- unchanged
- **Dedup guard** -- unchanged (keys are already scoped by toolName)
- **Hook I/O** (`hook-io.ts`) -- unchanged
- **Individual hook scripts** (pre-step-lu.ts, etc.) -- unchanged (they delegate to the factory)

### Why Dual Support Works

The regex matchers are additive (`"Skill|Agent"` matches either), and the
enforcement factory already uses a conditional gate that can check multiple
values. The skill name extraction falls through from `skill` to `subagent_type`
naturally. Both paths converge on the same `subSkills.has(matchedSkill)` check,
so the enforcement logic is identical regardless of which tool was used.

**Confidence:** HIGH -- straightforward code changes with no architectural risk.

---

## Finding 7: updatedInput Can Modify Agent Parameters (MEDIUM Confidence)

**Source:** [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks)

PreToolUse hooks can return `updatedInput` alongside `permissionDecision: "allow"`
to modify tool_input before execution. This means enforcement hooks could
theoretically modify the Agent's prompt or subagent_type, not just allow/deny.

This is not needed for basic enforcement but could be useful for:

- Injecting context into agent prompts
- Redirecting agent types
- Adding enforcement metadata to the prompt

**Confidence:** MEDIUM -- documented feature, not tested in this codebase.

---

## Don't Hand-Roll

| Problem                                | Don't Build                 | Use Instead                      | Why                                           |
| -------------------------------------- | --------------------------- | -------------------------------- | --------------------------------------------- |
| Skill name extraction from Agent calls | Custom parsing logic        | `tool_input.subagent_type` field | Official API provides the field directly      |
| Dual-tool matching                     | Separate hook registrations | Regex `"Skill\|Agent"` matcher   | Regex already works for `"Bash\|Skill"`       |
| Blocking invalid Agent calls           | SubagentStart hooks         | PreToolUse hooks                 | SubagentStart cannot block; PreToolUse can    |
| Agent type validation                  | String parsing of prompt    | `subagent_type` field            | Structured field avoids prompt injection risk |

---

## Configuration

### Required Changes (Total: ~10 lines across 3 files)

| File                                              | Change                                                           | Impact                 |
| ------------------------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| `src/hooks/__helpers/enforcement-hook-factory.ts` | Add `"Agent"` to tool_name gate + add `subagent_type` extraction | Core enforcement logic |
| `src/hooks/__helpers/hook-registry.ts`            | Change 6x `"Skill"` to `"Skill\|Agent"` in tool_filter           | Hook registration      |
| `src/hooks/scripts/pre-step-enforcement.ts`       | Add `"Agent"` to tool_name check                                 | Advisory enforcement   |

### Auto-Generated (via `bun run build:all`)

| File                    | Change                              | Impact                  |
| ----------------------- | ----------------------------------- | ----------------------- |
| `.claude/settings.json` | Matcher values update automatically | Claude Code hook config |

---

## Confidence Assessment

| Area                                 | Level  | Reason                                                      |
| ------------------------------------ | ------ | ----------------------------------------------------------- |
| Skill is a valid tool_name           | HIGH   | Official tools reference + production runtime confirmation  |
| Agent is a valid tool_name           | HIGH   | Official tools reference + hooks documentation              |
| Matcher syntax is regex              | HIGH   | Official docs + existing `"Bash\|Skill"` usage in this repo |
| Agent tool_input schema              | HIGH   | Official docs with explicit field listing                   |
| SubagentStart/Stop events            | HIGH   | Official docs with full JSON examples                       |
| Enforcement factory changes          | HIGH   | Direct source code inspection, minimal changes              |
| updatedInput capability              | MEDIUM | Documented but not tested in this codebase                  |
| Dual Skill+Agent support feasibility | HIGH   | Additive regex + fallthrough extraction = no conflicts      |

---

## Risk Assessment

### Low Risk

- **Matcher changes**: Adding `|Agent` to regex matchers is additive and cannot break existing Skill matching
- **Extraction fallthrough**: Adding `subagent_type` as a second fallback in the extraction chain cannot interfere with existing `skill` field extraction
- **Settings regeneration**: Build pipeline handles settings.json generation from hook-registry.ts

### Medium Risk

- **Build pipeline**: Changes to hook-registry.ts require `bun run build:all` which MUST NOT be run during a Claude Code session (crashes the process per MEMORY.md)
- **Dedup guard scoping**: The guardPreStep function uses toolName in its guard file key. With both "Skill" and "Agent" as valid tool names, the dedup guard files will be different per tool type. This is correct behavior (they are different events) but should be verified.

### Not a Risk

- **Backward compatibility**: The dual-support approach means existing Skill() calls continue to work unchanged. Only new Agent() calls get added support.

---

## Sources

- [Claude Code Tools Reference](https://code.claude.com/docs/en/tools-reference) -- authoritative tool list
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- matcher syntax, event types, stdin schemas
- [Claude Code Sub-agents Documentation](https://code.claude.com/docs/en/sub-agents) -- Agent tool_input schema, SubagentStart/Stop events
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- Skill tool behavior, permission syntax
- Source code: `src/hooks/__helpers/enforcement-hook-factory.ts` -- current enforcement implementation
- Source code: `src/hooks/__helpers/hook-registry.ts` -- hook registration with tool_filter values
- Source code: `src/hooks/__helpers/hook-io.ts` -- stdin parsing and exit code helpers
- Source code: `src/hooks/scripts/pre-step-lu.ts` -- example enforcement hook consumer
- Source code: `.claude/settings.json` -- current hook configuration with matchers
