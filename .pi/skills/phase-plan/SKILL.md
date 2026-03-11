---
name: phase-plan
description: Create detailed PLAN.md execution plans for a specific phase with tasks, waves, and verification.
---

# phase-plan

Create detailed PLAN.md execution plans for a specific phase with tasks, waves, and verification.

## main

<main>
# Luca Plan Phase

Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification.

**Default flow:** Cognitive Pre-Flight → Research (if needed) → Plan → Verify → Done

**Arguments:** `[phase] [--research] [--skip-research] [--gaps] [--skip-verify] [--skip-memory]`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- `lu-phase-researcher` - Researches implementation approaches before planning
- `lu-planner` - Creates PLAN.md files with task breakdowns
- `lu-plan-checker` - Validates plans before execution

**DO NOT** attempt to research, plan, or verify plans yourself. Spawn the appropriate agents.

**Reference:** See `.cursor/luca/references/task-directive.md` for Task() syntax patterns.

## Execution Context

Read this reference file before executing:

- `.cursor/luca/references/ui-brand.md`
- `.cursor/luca/workflows/cognitive-preflight.md`

## Cognitive Pre-Flight (NEW)

Before planning begins, run cognitive pre-flight:

### Step 0: Load Cognitive Context

**Unless `--skip-memory` is passed:**

1. **Load project identity** from MuninnDB:

   ```
   mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")
   ```

   Extract: architecture patterns, code conventions, development preferences

2. **Selective recall of learnings (deferred cache pattern):**

   Check the session-scoped recall cache first. If not yet recalled this session, perform the MuninnDB recall and cache it:

   ```typescript
   import { hasRecallCache, setCachedRecall } from "~/shared";

   if (!hasRecallCache(SESSION_ID)) {
     const recallResult = mcp__muninn__muninn_recall(
       vault: "default",
       context: "patterns, decisions, and pitfalls relevant to phase {PHASE}"
     );

     setCachedRecall(SESSION_ID, {
       sessionId: SESSION_ID,
       patterns: [/* extracted patterns from recall */],
       decisions: [/* extracted decisions from recall */],
       pitfalls: [/* extracted pitfalls from recall */],
       findings: [],
       recalledAt: new Date().toISOString(),
     });
   }
   ```

   Look for: relevant patterns, past decisions, known pitfalls

2.5. **Recall relevant procedures** from MuninnDB:

   ```
   mcp__muninn__muninn_recall(vault: "default", context: "reusable procedures and workflows for {phase_description}")
   ```

   Procedures are step-sequence templates from past successful executions.
   The planner should consider them as starting points for task breakdown.

3. **Initialize session** in MuninnDB for this planning session:

   ```
   mcp__muninn__muninn_remember(vault: "default", concept: "session:info", content: "workflow=phase-plan, phase=[phase number], started=[timestamp]")
   ```

   Store recalled context:
   - **Patterns**: [relevant patterns from MuninnDB]
   - **Decisions**: [relevant decisions]
   - **Pitfalls**: [flagged pitfalls]
   - **Procedures**: [relevant procedures from MuninnDB]

4. **Generate intuition flags**:
   - RISK: If past planning failed in similar areas
   - CAUTION: If complexity or integration issues noted
   - OPPORTUNITY: If strong patterns exist to follow

**Use cognitive context in planning:**

- Inform task breakdown based on past patterns
- Identify areas needing extra verification
- Apply successful planning approaches

## Process

### 1. Validate Environment and Resolve Model Profile

```bash
ls .planning/ 2>/dev/null
```

If not found: Error - user should run `/project-new` first.

**Resolve model profile for agent spawning:**

```bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
```

**Model lookup table:**

| Agent                  | quality | balanced | budget |
| ---------------------- | ------- | -------- | ------ |
| lu-phase-researcher | opus    | sonnet   | haiku  |
| lu-planner          | opus    | opus     | sonnet |
| lu-plan-checker     | sonnet  | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports `model="fast"` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

```
# All agents in plan-phase require reasoning → omit (inherit from parent)
researcher_model = (omit)
planner_model = (omit)
checker_model = (omit)
```

### 2. Parse and Normalize Arguments

Extract from arguments:

- Phase number (integer or decimal like `2.1`)
- `--research` flag to force re-research
- `--skip-research` flag to skip research
- `--gaps` flag for gap closure mode
- `--skip-verify` flag to bypass verification loop

**If no phase number:** Detect next unplanned phase from roadmap.

**Normalize phase to zero-padded format:**

```bash
if [[ "$PHASE" =~ ^[0-9]+$ ]]; then
  PHASE=$(printf "%02d" "$PHASE")
elif [[ "$PHASE" =~ ^([0-9]+).([0-9]+)$ ]]; then
  PHASE=$(printf "%02d.%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}")
fi
```

### 3. Validate Phase

```bash
grep -A5 "Phase ${PHASE}:" .planning/ROADMAP.md 2>/dev/null
```

If not found: Error with available phases. If found: Extract phase number, name, description.

### 4. Ensure Phase Directory Exists

```bash
PHASE_DIR=$(ls -d .planning/phases/${PHASE}-* 2>/dev/null | head -1)
if [ -z "$PHASE_DIR" ]; then
  PHASE_NAME=$(grep "Phase ${PHASE}:" .planning/ROADMAP.md | sed 's/.*Phase [0-9]*: //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  mkdir -p ".planning/phases/${PHASE}-${PHASE_NAME}"
  PHASE_DIR=".planning/phases/${PHASE}-${PHASE_NAME}"
fi
```

### 5. Handle Research

**If `--gaps` flag:** Skip research (gap closure uses VERIFICATION.md instead).

**If `--skip-research` flag:** Skip to step 6.

**Always runs** (model tier for lu-phase-researcher resolved from routing table per complexity). The `--skip-research` flag still allows skipping entirely.

| Complexity | Research | Model Tier (from routing table) |
|------------|----------|---------------------------------|
| TRIVIAL | Run | fast |
| SIMPLE | Run | balanced |
| MODERATE | Run | balanced |
| COMPLEX | Run | capable |
| CRITICAL | Run | capable |

Read complexity from bridge (falls back to STATE.md `Task Complexity:` field):

```bash
COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
```

The researcher model tier is resolved via `resolveModelForAgent("lu-phase-researcher", complexity)`.

**Check config for research setting:**

```bash
WORKFLOW_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true|false' || echo "true")
```

**MANDATORY**: If research is needed, you MUST spawn a lu-phase-researcher sub-agent. Do NOT attempt to research yourself.

First, read the required context:

```bash
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
# Primary: Read state from state machine bridge
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
CONTEXT_CONTENT=$(cat .planning/CONTEXT.md 2>/dev/null || echo "No context file")
```

Then spawn the researcher:

```python
Task(
  prompt="""
<research_context>

**Phase:** {phase_number}
**Phase Name:** {phase_name}
**Phase Goal:** {phase_goal from roadmap}

**Roadmap:**
{roadmap_content}

**Project State:**
{state_content}

**Requirements:**
{requirements_content}

**Domain Context:**
{context_content}

</research_context>

<research_focus>
1. How should this phase be implemented?
2. What existing patterns in the codebase should be followed?
3. What dependencies or integrations are needed?
4. What risks or challenges should be anticipated?
</research_focus>

<output_requirements>
- Create RESEARCH.md in phase directory
- Return summary of key findings and recommendations
</output_requirements>

Research how to implement this phase. Analyze the codebase, identify patterns, and document findings.
""",
  subagent_type="lu-phase-researcher",
  model="{researcher_model}",
  description="Research Phase {phase_number}"
)
```

**Do NOT proceed until the Task returns.**

### 6. Check Existing Plans

```bash
ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null
```

If exists: Offer to continue planning, view existing, or replan from scratch.

### 7. Read Context Files

Read and store context file contents for the planner agent:

- STATE.md, ROADMAP.md
- REQUIREMENTS.md, CONTEXT.md, RESEARCH.md (if exist)
- VERIFICATION.md, UAT.md (if --gaps mode)

### 8. Spawn lu-planner Agent

Display stage banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
```

**MANDATORY**: You MUST spawn a lu-planner sub-agent. Do NOT attempt to create plans yourself.

First, read all context files (already done in step 7):

```bash
# Primary: Read state from state machine bridge
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
RESEARCH_CONTENT=$(cat "${PHASE_DIR}/RESEARCH.md" 2>/dev/null || echo "No research file")
VERIFICATION_CONTENT=$(cat "${PHASE_DIR}/VERIFICATION.md" 2>/dev/null || echo "")  # For gaps mode
```

**Build memory context for sub-agents (deferred pattern):** Use `requestMemoryContext()` from `src/shared/__helpers/memory-context-builder.ts` which reads the recall cache populated in Step 0 substep 2 and formats it into a compact `<memory_context>` block. Pass the result as `{working_content}` in the Task() prompt below.

```typescript
import { requestMemoryContext } from "~/shared";

const workingContent = requestMemoryContext({
  agentName: "lu-planner",
  sessionId: SESSION_ID,
  memoryTags: ["planning", "architecture"],
  maxTokens: 500,
});
```

**Note:** `requestMemoryContext()` reads the cache populated by `setCachedRecall()` in Step 0 and formats it via `buildMemoryContextBlock()` internally. You can still use `buildMemoryContextBlock()` directly if you need custom formatting.

Then spawn the planner:

```python
Task(
  prompt="""
<planning_context>

**Phase:** {phase_number}
**Phase Name:** {phase_name}
**Mode:** {standard | gap_closure}
**Phase Directory:** {phase_dir}

**Project State:**
{state_content}

**Roadmap:**
{roadmap_content}

**Requirements:**
{requirements_content}

**Research (if available):**
{research_content}

**Verification Issues (for gap mode):**
{verification_content}

**Working Memory:**
{working_content}

</planning_context>

<downstream_consumer>
Output consumed by /phase-execute.
Plans must be executable prompts with:
- YAML frontmatter (id, title, wave, tasks)
- Clear task descriptions with goals
- Verification criteria for each task
- Dependencies between tasks
</downstream_consumer>

<output_requirements>
- Create {N}-PLAN.md files in phase directory
- Organize tasks into waves for parallel execution
- Each plan should be focused and completable in one session
- Return summary of plans created
</output_requirements>

Create PLAN.md files for this phase with tasks, waves, and dependencies.
""",
  subagent_type="lu-planner",
  model="{planner_model}",
  description="Plan Phase {phase_number}"
)
```

**Do NOT proceed until the Task returns.**

### 9. Handle Planner Return

- **PLANNING COMPLETE:** Proceed to verification (unless --skip-verify)
- **CHECKPOINT REACHED:** Present to user, get response
- **PLANNING INCONCLUSIVE:** Offer options to add context, retry, or manual

### 10. Spawn lu-plan-checker Agent

Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Always runs** (iteration count scales with complexity, model tier for lu-plan-checker resolved from routing table).

| Complexity | Plan Verification Iterations | Model Tier (from routing table) |
|------------|-----------------------------|---------------------------------|
| TRIVIAL | 1 iteration | fast |
| SIMPLE | 1 iteration | balanced |
| MODERATE | 1 iteration | balanced |
| COMPLEX | 2 iterations | capable |
| CRITICAL | 3 iterations | capable |

The plan-checker model tier is resolved via `resolveModelForAgent("lu-plan-checker", complexity)`.

**MANDATORY**: You MUST spawn a lu-plan-checker sub-agent. Do NOT attempt to verify plans yourself.

First, read the created plans:

```bash
PLANS_CONTENT=$(find "${PHASE_DIR}" -name "*-PLAN.md" -exec cat {} ;)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
```

Then spawn the plan checker:

```python
Task(
  prompt="""
<verification_context>

**Phase:** {phase_number}
**Phase Goal:** {phase_goal from roadmap}

**Plans to Verify:**
{plans_content}

**Roadmap:**
{roadmap_content}

**Requirements:**
{requirements_content}

</verification_context>

<verification_criteria>
1. **Completeness**: Do plans cover all phase requirements?
2. **Executability**: Are tasks clear and actionable?
3. **Dependencies**: Are wave assignments and dependencies correct?
4. **Verification**: Does each task have verification criteria?
5. **Goal Alignment**: Will executing these plans achieve the phase goal?
</verification_criteria>

<output_requirements>
- Return status: PASSED | ISSUES_FOUND
- If issues found, list specific problems with plan references
- Suggest fixes for each issue
</output_requirements>

Verify these plans will achieve the phase goal when executed.
""",
  subagent_type="lu-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase_number} plans"
)
```

**Do NOT proceed until the Task returns.**

### 11. Handle Checker Return

- **VERIFICATION PASSED:** Plans verified, ready for execution
- **ISSUES FOUND:** Send back to planner for revision

### 12. Revision Loop (Complexity-Scaled Iterations)

Check the current complexity level's gating matrix for `planVerificationIterations`:

```bash
luca-bridge read-status 2>/dev/null
# Then parse planVerificationIterations from the complexity matrix for this level
```

*(If using the pi extension tool `luca_gate_check`, it returns the full matrix for the current level).*

If issues found and iteration_count < planVerificationIterations:

- Spawn lu-planner with revision context
- Re-verify with checker
- Repeat until passed or max iterations

### 13. Present Final Status

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PHASE {X} PLANNED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

## ▶ Next Up

**Execute Phase {X}** — run all {N} plans

/phase-execute {X}
```

## Success Criteria

- [ ] .planning/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] lu-planner spawned with context
- [ ] Plans created
- [ ] lu-plan-checker spawned (unless --skip-verify)
- [ ] Verification passed OR user override
- [ ] User knows next steps (execute or review)

## Next Steps

| Condition                  | Action            | Command                        |
| -------------------------- | ----------------- | ------------------------------ |
| Plans created successfully | Execute the phase | `/phase-execute {phase}` |
| Want to review plans first | Check progress    | `/progress`              |
| Need more context          | Discuss the phase | `/phase-discuss {phase}` |

**Primary:** `/phase-execute {phase}` — Run all plans in the phase

**Also available:**

- `/progress` — See plan details before executing
- `/phase-discuss {phase}` — Gather more context if plans seem off
</main>