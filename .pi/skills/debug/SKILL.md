---
name: debug
description: Systematic debugging workflow with persistent hypothesis state across context resets.
---

# debug

Systematic debugging workflow with persistent hypothesis state across context resets.

## main

<main>
# Luca Debug

Debug issues using scientific method with subagent isolation.

**Arguments:** `[issue description]`

**Orchestrator role:** Gather symptoms, spawn lu-debugger agent, handle checkpoints, spawn continuations.

**Why subagent:** Investigation burns context fast (reading files, forming hypotheses, testing). Fresh 200k context per investigation. Main context stays lean for user interaction.

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `lu-debugger` - Investigates bugs using scientific method

**DO NOT** attempt to debug or investigate issues yourself. Spawn the debugger agent.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

## Process

### 0. Resolve Model Profile

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

**Model lookup table:**

| Agent          | quality | balanced | budget |
| -------------- | ------- | -------- | ------ |
| lu-debugger | opus    | sonnet   | sonnet |

> **Current Limitation:** Cursor's Task tool only supports `model="fast"` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

```
# Debugging requires deep reasoning → omit (inherit from parent)
debugger_model = (omit)
```

### 1. Check Active Sessions

Check for active debug sessions:

```bash
ls .planning/debug/*.md 2>/dev/null | grep -v resolved | head -5
```

If active sessions exist AND no arguments:

- List sessions with status, hypothesis, next action
- User picks number to resume OR describes new issue

If arguments provided OR user describes new issue:

- Continue to symptom gathering

### 2. Gather Symptoms (if new issue)

Use AskQuestion for each:

1. **Expected behavior** - What should happen?
2. **Actual behavior** - What happens instead?
3. **Error messages** - Any errors? (paste or describe)
4. **Timeline** - When did this start? Ever worked?
5. **Reproduction** - How do you trigger it?

After all gathered, confirm ready to investigate.

### 3. Spawn lu-debugger Agent

**MANDATORY**: You MUST spawn a lu-debugger sub-agent. Do NOT attempt to debug or investigate yourself.

First, create debug session file:

```bash
SESSION_ID=$(date +%Y%m%d-%H%M%S)
DEBUG_FILE=".planning/debug/session-${SESSION_ID}.md"
mkdir -p .planning/debug
```

Read cognitive context if available:

```bash
# Primary: Read memory from memory bridge (filtered by debugging-relevant tags)
MEMORY_JSON=$(bun run src/memory/bridge.ts read-memory --tags=debugging,pitfalls,coding --limit=10 2>/dev/null || echo '{"entries":[]}')
# Fallback: Read MEMORY.md directly
MEMORY_CONTENT=$(cat .planning/MEMORY.md 2>/dev/null || echo "No memory file")
# Primary: Read working memory from memory bridge
WORKING_JSON=$(bun run src/memory/bridge.ts read-working 2>/dev/null || echo '{"sections":[],"total_tokens":0,"status":"cleared"}')
# Fallback: Read WORKING.md directly
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "No working memory")
```

Then spawn the debugger:

```python
Task(
  prompt="""
<debug_context>

**Session ID:** {session_id}
**Debug File:** {debug_file}

**Symptoms:**
- Expected: {expected_behavior}
- Actual: {actual_behavior}
- Errors: {error_messages}
- Timeline: {timeline}
- Reproduction: {reproduction_steps}

**Memory (past pitfalls/patterns):**
{memory_content}

**Working Memory:**
{working_content}

</debug_context>

<investigation_process>
1. Form initial hypotheses based on symptoms
2. Test each hypothesis systematically
3. Document findings in debug file
4. If context limit approaching, create CHECKPOINT
5. When root cause found, document with evidence
</investigation_process>

<output_requirements>
Return one of:
- ## ROOT CAUSE FOUND - with cause, evidence, and suggested fix
- ## CHECKPOINT REACHED - with current state and next steps
- ## INVESTIGATION INCONCLUSIVE - with what was checked and eliminated
</output_requirements>

Investigate this issue using scientific method. Document all findings.
""",
  subagent_type="lu-debugger",
  model="{debugger_model}",
  description="Debug: {issue_summary}"
)
```

**Do NOT proceed until the Task returns.**

### 4. Handle Agent Return

**If `## ROOT CAUSE FOUND`:**

- Display root cause and evidence summary
- Offer options:
  - "Fix now" - spawn fix subagent
  - "Plan fix" - suggest /phase-plan --gaps
  - "Manual fix" - done

**If `## CHECKPOINT REACHED`:**

- Present checkpoint details to user
- Get user response
- Spawn continuation agent

**If `## INVESTIGATION INCONCLUSIVE`:**

- Show what was checked and eliminated
- Offer options:
  - "Continue investigating" - spawn new agent with additional context
  - "Manual investigation" - done
  - "Add more context" - gather more symptoms, spawn again

### 5. Spawn Continuation Agent (After Checkpoint)

**MANDATORY**: You MUST spawn a fresh lu-debugger sub-agent to continue. Do NOT attempt to continue debugging yourself.

First, read the checkpoint state:

```bash
DEBUG_FILE_CONTENT=$(cat "${DEBUG_FILE}")
USER_RESPONSE="[response from user about checkpoint question]"
```

Then spawn continuation agent:

```python
Task(
  prompt="""
<continuation_context>

**Session ID:** {session_id}
**Debug File:** {debug_file}

**Previous Investigation State:**
{debug_file_content}

**User Response to Checkpoint:**
{user_response}

</continuation_context>

<instructions>
Continue the investigation from where the previous agent left off.
- Read the debug file for current state
- Use the user's response to inform next steps
- Continue testing hypotheses
- Document all new findings
</instructions>

<output_requirements>
Return one of:
- ## ROOT CAUSE FOUND - with cause, evidence, and suggested fix
- ## CHECKPOINT REACHED - with current state and next steps
- ## INVESTIGATION INCONCLUSIVE - with what was checked and eliminated
</output_requirements>

Continue investigating from the checkpoint.
""",
  subagent_type="lu-debugger",
  model="{debugger_model}",
  description="Debug continuation: {session_id}"
)
```

**Do NOT proceed until the Task returns.**

Loop back to Step 4 to handle the return.

## Success Criteria

- [ ] Active sessions checked
- [ ] Symptoms gathered (if new)
- [ ] lu-debugger spawned with context
- [ ] Checkpoints handled correctly
- [ ] Root cause confirmed before fixing

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Root cause found, fix needed | Plan the fix | `/phase-plan {phase} --gaps` |
| Root cause found, quick fix | Fix directly | `/quick` |
| Investigation inconclusive | Check project status | `/progress` |
| Debug session saved | Resume later | `/debug` (lists active sessions) |

**Primary:** `/progress` — Check project status after debugging

**Also available:**

- `/phase-plan {phase} --gaps` — Plan systematic fix
- `/quick` — Execute quick fix directly
</main>