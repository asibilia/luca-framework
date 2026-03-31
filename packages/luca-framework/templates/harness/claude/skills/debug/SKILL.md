# debug

Systematic debugging workflow with persistent hypothesis state across context resets.

## main

<main>
# <%= branding.frameworkName %> Debug

Debug issues using scientific method with subagent isolation.

**Arguments:** `[issue description]`

**Orchestrator role:** Gather symptoms, spawn <%= branding.commandPrefix %>-debugger agent, handle checkpoints, spawn continuations.

**Why subagent:** Investigation burns context fast (reading files, forming hypotheses, testing). Fresh 200k context per investigation. Main context stays lean for user interaction.

## Vault Resolution

Read `.planning/config.json` and extract `muninn.vault` as REPO_VAULT. Set DEFAULT_VAULT = "default".

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

Use REPO_VAULT for project-scoped operations (session, metric, brain:project) and DEFAULT_VAULT for cross-cutting operations (pattern, pitfall, preference, brain:user).

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `<%= branding.commandPrefix %>-debugger` - Investigates bugs using scientific method

**DO NOT** attempt to debug or investigate issues yourself. Spawn the debugger agent.

**Reference:** See `.claude/<%= branding.nameLowercase %>/references/task-directive.md` for Task() syntax patterns.

## Process

```bash
luca-bridge write-status --skill=debug --stage=DEBUGGING 2>/dev/null || true
```

### 0. Resolve Model Profile

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

**Model lookup table:**

| Agent          | quality | balanced | budget |
| -------------- | ------- | -------- | ------ |
| <%= branding.commandPrefix %>-debugger | opus    | sonnet   | sonnet |

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

### 3. Spawn <%= branding.commandPrefix %>-debugger Agent

**MANDATORY**: You MUST spawn a <%= branding.commandPrefix %>-debugger sub-agent. Do NOT attempt to debug or investigate yourself.

First, create debug session file:

```bash
SESSION_ID=$(date +%Y%m%d-%H%M%S)
DEBUG_FILE=".planning/debug/session-${SESSION_ID}.md"
mkdir -p .planning/debug
```

Read cognitive context if available:

Recall debugging context from MuninnDB:

```
# Recall debugging patterns and past pitfalls
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "debugging patterns and past pitfalls")

# Recall current session debugging context
mcp__muninn__muninn_recall(vault: REPO_VAULT, context: "current session debugging context")
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
  subagent_type="<%= branding.commandPrefix %>-debugger",
  model="{debugger_model}",
  description="Debug: {issue_summary}"
)
```

**Do NOT proceed until the Task returns.**

### 4. Handle Agent Return

**If `## ROOT CAUSE FOUND`:**

- Display root cause and evidence summary
- Proceed to Step 4.5 (Root Cause Tribunal) if gating conditions are met
- Otherwise, offer options:
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

### 4.5 Root Cause Tribunal (Conditional)

**Gate check:** Only run when ALL conditions are met:

```bash
# Read complexity from STATE.md
COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md 2>/dev/null | awk '{print $NF}' || echo "MODERATE")

# Read tribunal config (default: true)
TRIBUNAL_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"root_cause_tribunal_enabled"[[:space:]]*:[[:space:]]*[a-z]*' | grep -o '[a-z]*$' || echo "true")

# Count issues in the debug session
ISSUE_COUNT=$(grep -c "^##\|^- \[" "${DEBUG_FILE}" 2>/dev/null || echo "1")
```

**Skip if:** `TRIBUNAL_ENABLED` is "false", OR `COMPLEXITY` is below COMPLEX, OR `ISSUE_COUNT < 2`, OR <%= branding.commandPrefix %>-debugger did NOT return `## ROOT CAUSE FOUND` or `## DEBUG COMPLETE`.

**When gated in:** Parse the debugger's return to extract root_cause, proposed_fix, files_changed, evidence_summary.

**Step 4.5.1:** Spawn three tribunal agents in PARALLEL:

```python
# Defender: <%= branding.commandPrefix %>-debugger defends its own fix
Task(
  prompt=buildDebuggerDefensePrompt(fix_signal),
  subagent_type="<%= branding.commandPrefix %>-debugger",
  description="Root Cause Tribunal: Defender"
)

# Challenger: <%= branding.commandPrefix %>-verifier independently challenges the fix
Task(
  prompt=buildVerifierChallengePrompt(fix_signal),
  subagent_type="<%= branding.commandPrefix %>-verifier",
  description="Root Cause Tribunal: Challenger"
)

# Arbiter: <%= branding.commandPrefix %>-integration-checker arbitrates
Task(
  prompt=buildArbiterPrompt(fix_signal),
  subagent_type="<%= branding.commandPrefix %>-integration-checker",
  description="Root Cause Tribunal: Arbiter"
)
```

**Step 4.5.2:** Parse responses, resolve consensus via `resolveRootCauseTribunal`.

**Step 4.5.3:** Display tribunal result:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Root Cause Tribunal Result
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Consensus: {consensus_category} ({consensus_confidence})
Resolution: {resolution}
Action: {recommended_action}

| Agent                  | Category        | Confidence |
|------------------------|-----------------|------------|
| <%= branding.commandPrefix %>-debugger (defender) | {category}      | {conf}     |
| <%= branding.commandPrefix %>-verifier (chall.)   | {category}      | {conf}     |
| <%= branding.commandPrefix %>-integ-checker (arb.)| {category}      | {conf}     |

{dissenting_perspective if present}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Step 4.5.4:** Route based on resolution:
- `"verified_fix"` -> Proceed to commit/fix flow as normal (offer options from Step 4)
- `"needs_deeper_investigation"` -> Suggest re-running `/debug` with narrowed focus based on tribunal findings

### 5. Spawn Continuation Agent (After Checkpoint)

**MANDATORY**: You MUST spawn a fresh <%= branding.commandPrefix %>-debugger sub-agent to continue. Do NOT attempt to continue debugging yourself.

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
  subagent_type="<%= branding.commandPrefix %>-debugger",
  model="{debugger_model}",
  description="Debug continuation: {session_id}"
)
```

**Do NOT proceed until the Task returns.**

Loop back to Step 4 to handle the return.

```bash
luca-bridge clear-status 2>/dev/null || true
```

## Success Criteria

- [ ] Active sessions checked
- [ ] Symptoms gathered (if new)
- [ ] <%= branding.commandPrefix %>-debugger spawned with context
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