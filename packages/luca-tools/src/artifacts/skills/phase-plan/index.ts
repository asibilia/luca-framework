/**
 * phase-plan skill — Create detailed PLAN.md execution plans for a specific phase with tasks, waves, and verification.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-plan/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Plan Phase

Create executable phase prompts (plan.md files) for a roadmap phase with integrated research and verification.

**Default flow:** Cognitive Pre-Flight → Research (if needed) → Plan → Verify → Done

**Arguments:** \`[phase] [--research] [--skip-research] [--gaps] [--skip-verify] [--skip-memory]\`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`researcher\` - Researches implementation approaches before planning (5-dimension parallel batch)
- The \`architect\` mode-agent performs the planning work in v13 (the v12-era \`lu-planner\` subagent was dropped per plan §5.6)
- \`plan-reviewer\` - Validates plans before execution

**DO NOT** attempt to research, plan, or verify plans yourself. Spawn the appropriate subagents via the \`Task\` tool, or invoke the architect mode-agent.

## Cognitive Pre-Flight (NEW)

Before planning begins, run cognitive pre-flight:

### Step 0: Load Cognitive Context

**Unless \`--skip-memory\` is passed:**

1. **Load project identity** from MuninnDB:

   \`\`\`
   mcp__muninn__muninn_recall_tree(vault: "default", id: "brain:project-identity")
   \`\`\`

   Extract: architecture patterns, code conventions, development preferences

2. **Selective recall of learnings** from MuninnDB based on phase keywords:

   \`\`\`
   mcp__muninn__muninn_recall(vault: "default", context: "patterns, decisions, and pitfalls relevant to phase {PHASE}")
   \`\`\`

   Look for: relevant patterns, past decisions, known pitfalls

2.5. **Recall relevant procedures** from MuninnDB:

   \`\`\`
   mcp__muninn__muninn_recall(vault: "default", context: "reusable procedures and workflows for {phase_description}")
   \`\`\`

   Procedures are step-sequence templates from past successful executions.
   The planner should consider them as starting points for task breakdown.

3. **Initialize session** in MuninnDB for this planning session:

   \`\`\`
   mcp__muninn__muninn_remember(vault: "default", concept: "session:info", content: "workflow=phase-plan, phase=[phase number], started=[timestamp]")
   \`\`\`

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

\`\`\`bash
ls .luca/ 2>/dev/null
\`\`\`

If not found: Error - user should run \`/project-new\` first.

Models are resolved at runtime via \`resolveModelForAgent(agentName, complexity)\` from the centralized routing table (\`src/complexity/__helpers/model-routing.ts\`) — the orchestrator does not pick model strings. The \`researcher\`, \`architect\` (mode-agent), and \`plan-reviewer\` subagents all inherit the appropriate tier based on the active complexity level.

### 2. Parse and Normalize Arguments

Extract from arguments:

- Phase number (integer or decimal like \`2.1\`)
- \`--research\` flag to force re-research
- \`--skip-research\` flag to skip research
- \`--gaps\` flag for gap closure mode
- \`--skip-verify\` flag to bypass verification loop

**If no phase number:** Detect next unplanned phase from roadmap.

**Normalize phase to zero-padded format:**

\`\`\`bash
if [[ "$PHASE" =~ ^[0-9]+$ ]]; then
  PHASE=$(printf "%02d" "$PHASE")
elif [[ "$PHASE" =~ ^([0-9]+).([0-9]+)$ ]]; then
  PHASE=$(printf "%02d.%s" "\${BASH_REMATCH[1]}" "\${BASH_REMATCH[2]}")
fi
\`\`\`

### 3. Validate Phase

\`\`\`bash
grep -A5 "Phase \${PHASE}:" .luca/roadmap.md 2>/dev/null
\`\`\`

If not found: Error with available phases. If found: Extract phase number, name, description.

### 4. Ensure Phase Directory Exists

\`\`\`bash
PHASE_DIR=$(ls -d .luca/phases/\${PHASE}-* 2>/dev/null | head -1)
if [ -z "$PHASE_DIR" ]; then
  PHASE_NAME=$(grep "Phase \${PHASE}:" .luca/roadmap.md | sed 's/.*Phase [0-9]*: //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  mkdir -p ".luca/phases/\${PHASE}-\${PHASE_NAME}"
  PHASE_DIR=".luca/phases/\${PHASE}-\${PHASE_NAME}"
fi
\`\`\`

### 5. Handle Research

**If \`--gaps\` flag:** Skip research (gap closure uses VERIFICATION.md instead).

**If \`--skip-research\` flag:** Skip to step 6.

**Always runs** (model tier for lu-phase-researcher resolved from routing table per complexity). The \`--skip-research\` flag still allows skipping entirely.

| Complexity | Research | Model Tier (from routing table) |
|------------|----------|---------------------------------|
| TRIVIAL | Run | fast |
| SIMPLE | Run | balanced |
| MODERATE | Run | balanced |
| COMPLEX | Run | capable |
| CRITICAL | Run | capable |

Read complexity from the canonical workflow state:

\`\`\`bash
COMPLEXITY=$(luca state read 2>/dev/null | jq -r '.complexity // "MODERATE"')
\`\`\`

The researcher model tier is resolved via \`resolveModelForAgent("lu-phase-researcher", complexity)\`.

**Check config for research setting:**

\`\`\`bash
WORKFLOW_RESEARCH=$(cat .luca/config.json 2>/dev/null | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true|false' || echo "true")
\`\`\`

**MANDATORY**: If research is needed, you MUST spawn a lu-phase-researcher sub-agent. Do NOT attempt to research yourself.

First, read the required context:

\`\`\`bash
ROADMAP_CONTENT=$(cat .luca/roadmap.md)
# Read workflow state from .luca/state.json via the luca CLI
STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
# Phase-scoped context (research, plan, decisions) lives under .luca/phases/<currentPhaseSlug>/
CONTEXT_CONTENT=$(find .luca/phases -name context.md -newer .luca/state.json 2>/dev/null | head -1 | xargs cat 2>/dev/null || echo "No context file")
\`\`\`

Then spawn the researcher:

\`\`\`python
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
- Create research.md in phase directory
- Return summary of key findings and recommendations
</output_requirements>

Research how to implement this phase. Analyze the codebase, identify patterns, and document findings.
""",
  subagent_type="lu-phase-researcher",
  model="{researcher_model}",
  description="Research Phase {phase_number}"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### 6. Check Existing Plans

\`\`\`bash
ls "\${PHASE_DIR}"/*-plan.md 2>/dev/null
\`\`\`

If exists: Offer to continue planning, view existing, or replan from scratch.

### 7. Read Context Files

Read and store context file contents for the planning step:

- Workflow state via \`luca state read\`, roadmap.md
- MuninnDB \`brain:project-requirements\` (recall), active phase's context.md + research.md (if exist)
- Active phase's verify.json (if --gaps mode)

### 8. Invoke the Architect Mode-Agent (Planning)

Display stage banner:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Invoking architect mode-agent for planning...
\`\`\`

**MANDATORY**: The architect mode-agent performs planning in v13 (the v12-era \`lu-planner\` subagent was dropped per plan §5.6). Invoke it via the standard mode-transition flow — do NOT attempt to create plans yourself.

First, read all context files (already done in step 7):

\`\`\`bash
# Read workflow state from .luca/state.json via the luca CLI
STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
ROADMAP_CONTENT=$(cat .luca/roadmap.md)
RESEARCH_CONTENT=$(cat "\${PHASE_DIR}/research.md" 2>/dev/null || echo "No research file")
VERIFICATION_CONTENT=$(cat "\${PHASE_DIR}/verify.json" 2>/dev/null || echo "")  # For gaps mode
# Recall session context from MuninnDB:
# mcp__muninn__muninn_recall(vault: "default", context: "current session context for planning")
WORKING_CONTENT="[recalled from MuninnDB session context]"
\`\`\`

Then invoke the architect mode-agent (typically by transitioning into the architect mode-agent's plan flow):

\`\`\`python
# The architect mode-agent is invoked via the standard mode-transition flow rather than spawned as a subagent.
# When orchestrating from this skill body, build the planning brief and pass it to the architect mode-agent's
# plan step. The brief includes:
#
# <planning_context>
#   Phase: {phase_number}
#   Phase Name: {phase_name}
#   Mode: {standard | gap_closure}
#   Phase Directory: {phase_dir}
#   Project State: {state_content}
#   Roadmap: {roadmap_content}
#   Research (if available): {research_content}
#   Verification Issues (for gap mode): {verification_content}
#   Working Memory: {working_content}
# </planning_context>
#
# <downstream_consumer>
#   Output consumed by /phase-execute.
#   Plans must be executable prompts with: YAML frontmatter (id, title, wave, tasks), clear task descriptions with goals,
#   verification criteria for each task, dependencies between tasks.
# </downstream_consumer>
#
# <output_requirements>
#   - Write the canonical plan.md to .luca/phases/<slug>/plan.md
#   - Organize tasks into waves for parallel execution
#   - Each plan should be focused and completable in one session
#   - Return summary of plan created
# </output_requirements>
Task(
  prompt="...",
  subagent_type="architect",  # mode-agent name
  description="Plan Phase {phase_number}"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### 9. Handle Planner Return

- **PLANNING COMPLETE:** Proceed to verification (unless --skip-verify)
- **CHECKPOINT REACHED:** Present to user, get response
- **PLANNING INCONCLUSIVE:** Offer options to add context, retry, or manual

### 10. Spawn lu-plan-checker Agent

Display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

**Always runs** (iteration count scales with complexity, model tier for lu-plan-checker resolved from routing table).

| Complexity | Plan Verification Iterations | Model Tier (from routing table) |
|------------|-----------------------------|---------------------------------|
| TRIVIAL | 1 iteration | fast |
| SIMPLE | 1 iteration | balanced |
| MODERATE | 1 iteration | balanced |
| COMPLEX | 2 iterations | capable |
| CRITICAL | 3 iterations | capable |

The plan-checker model tier is resolved via \`resolveModelForAgent("lu-plan-checker", complexity)\`.

**MANDATORY**: You MUST spawn the \`plan-reviewer\` subagent. Do NOT attempt to verify plans yourself.

First, read the created plan (canonical: one \`plan.md\` per phase per LUCA_DIR_CONTRACT):

\`\`\`bash
PLAN_CONTENT=$(cat "\${PHASE_DIR}/plan.md" 2>/dev/null)
ROADMAP_CONTENT=$(cat .luca/roadmap.md)
# Recall requirements from MuninnDB:
# mcp__muninn__muninn_recall_tree(vault: "<repo_vault>", id: "brain:project-requirements")
\`\`\`

Then spawn the plan checker:

\`\`\`python
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
\`\`\`

**Do NOT proceed until the Task returns.**

### 11. Handle Checker Return

- **VERIFICATION PASSED:** Plans verified, ready for execution
- **ISSUES FOUND:** Send back to planner for revision

### 12. Revision Loop (Complexity-Scaled Iterations)

Check the current complexity level's gating matrix for \`planVerificationIterations\`:

\`\`\`bash
luca state read 2>/dev/null | jq -r '.complexity // "MODERATE"'
# Then parse planVerificationIterations from .luca/config.json complexity matrix for that level
\`\`\`

The complexity matrix lives in \`.luca/config.json\` under \`complexity.matrix.<LEVEL>.planVerificationIterations\`.

If issues found and iteration_count < planVerificationIterations:

- Re-invoke the architect mode-agent with revision context
- Re-verify with the plan-reviewer subagent
- Repeat until passed or max iterations

### 13. Present Final Status

\`\`\`
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
\`\`\`

## Success Criteria

- [ ] .luca/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] architect mode-agent invoked with planning context (researcher + plan-reviewer subagents spawned as required)
- [ ] Plans created
- [ ] lu-plan-checker spawned (unless --skip-verify)
- [ ] Verification passed OR user override
- [ ] User knows next steps (execute or review)

## Next Steps

| Condition                  | Action            | Command                        |
| -------------------------- | ----------------- | ------------------------------ |
| Plans created successfully | Execute the phase | \`/phase-execute {phase}\` |
| Want to review plans first | Check progress    | \`/progress\`              |
| Need more context          | Discuss the phase | \`/phase-discuss {phase}\` |

**Primary:** \`/phase-execute {phase}\` — Run all plans in the phase

**Also available:**

- \`/progress\` — See plan details before executing
- \`/phase-discuss {phase}\` — Gather more context if plans seem off
</main>
`

export const phasePlanSkill = defineSkill({
    name: "phase-plan",
    description: "Create detailed plan.md execution plans for a specific phase with tasks, waves, and verification.",
    body: BODY,
})
