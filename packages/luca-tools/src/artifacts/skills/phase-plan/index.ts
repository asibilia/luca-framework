/**
 * phase-plan skill — Create detailed PLAN.md execution plans for a specific phase with tasks, waves, and verification.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/phase-plan/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'
import { INPHASE_TERSENESS_DIRECTIVE } from '../../shared/index.ts'

const BODY = `<main>
# Luca Plan Phase

Create executable phase prompts (plan.md files) for a roadmap phase with integrated research and verification.

**Default flow:** Cognitive Pre-Flight → Research (if needed) → Plan → Verify → Done

${INPHASE_TERSENESS_DIRECTIVE}

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

   \`\`\`bash
   luca brain recall-root --concept brain:project-identity
   \`\`\`

   Follow the emitted \`muninn_recall_tree\` procedure (it resolves the cached root ULID from the repo vault). Do NOT call \`muninn_recall_tree(id: "brain:project-identity")\` directly — recall_tree rejects a concept as root_id, and the brain tree lives in the repo vault (not \`default\`).

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
   mcp__muninn__muninn_remember(vault: "<repo_vault>", concept: "session:info", content: "workflow=phase-plan, phase=[phase number], started=[timestamp]")
   \`\`\`

   (\`session:*\` is project-scoped → the **repo vault** (\`.luca/config.json\` → \`muninn.vault\`, fallback \`default\`), not the shared \`default\` vault.)

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

### Step 0 — Ensure pipelineStep (self-gate)

Run \`luca state read\`. This skill writes \`plan.md\`, which the stage-gate hook permits **only** in the \`plan\` pipelineStep. The single legal forward entry is \`architect → plan\` (loop-back entries \`plan-review → plan\` and \`learn → plan\` already land you at \`plan\`).

- \`pipelineStep === "plan"\` → already there, proceed.
- \`pipelineStep === "architect"\` → run \`luca state advance --to-step plan\`, then proceed.
- anything else → STOP. The pipeline must reach \`architect\` before planning can run — point the user at \`/lu\`. Do NOT force the transition or write \`plan.md\` from the wrong step (the hook will BLOCK it). This guard intentionally surfaces a mis-routing caller — e.g. an orchestrator that delegated here while the state was still at \`architect\` without advancing.

### 1. Validate Environment

\`\`\`bash
ls .luca/ 2>/dev/null
\`\`\`

If not found: Error - user should run \`/project-new\` first.

> Model tiers come from each agent's own definition (and the harness default); this orchestrator never picks model strings.

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

**Always runs** (model tier for researcher comes from the agent definition). The \`--skip-research\` flag still allows skipping entirely.

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

The researcher model tier is set by the agent’s own definition.

**Check config for research setting:**

\`\`\`bash
WORKFLOW_RESEARCH=$(cat .luca/config.json 2>/dev/null | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true|false' || echo "true")
\`\`\`

**MANDATORY**: If research is needed, you MUST spawn a researcher sub-agent. Do NOT attempt to research yourself.

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
- Do NOT write research.md (or any .luca/ artifact). This is plan-time research running in the \`plan\` pipelineStep, where the only legal artifact is plan.md — the stage-gate hook will BLOCK a research.md write here. The discrete \`research\` step (driven by /lu or /phase-research) owns research.md; this supplementary research feeds the plan in-context only.
- Return a structured summary of key findings and recommendations for the architect to fold directly into plan.md
</output_requirements>

Research how to implement this phase. Analyze the codebase and identify patterns. Return your findings — do not persist them to disk.
""",
  subagent_type="researcher",
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

> **Confidence emission**: the architect logs a confidence entry per non-trivial plan-time decision — see its "Confidence Emission (plan-time)" section for triggers, field guidance, and the \`luca confidence log\` invocation pattern. These entries feed the **active** confidence gate that runs after plan-review and before execute begins.

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
#   a ## Verification Criteria section with stable plan-authored ac-IDs (- **ac-NN**: <one binary probe>) referenced by
#   each task's Verification line, >=1 anti-criterion (- **anti-NN**: MUST NOT — <guard + probe>), and dependencies
#   between tasks. The verifier consumes ac-IDs verbatim — never renumber across revisions (splits become ac-NN.M).
#   Plans must also carry a ## Deliverables section mapping every explicit ask in the phase goal to >=1 ac-ID
#   (canonical D-line grammar lives in the Architect mode plan template — do not improvise it here).
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
  subagent_type="luca: Architect",  # mode-agent name
  description="Plan Phase {phase_number}"
)
\`\`\`

**Do NOT proceed until the Task returns.**

### 9. Handle Planner Return

- **PLANNING COMPLETE:** Proceed to verification (unless --skip-verify)
- **CHECKPOINT REACHED:** Present to user, get response
- **PLANNING INCONCLUSIVE:** Offer options to add context, retry, or manual

### 10. Spawn plan-reviewer Agent

Display:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

**Always runs** (iteration count scales with complexity).

| Complexity | Plan Verification Iterations | Model Tier (from routing table) |
|------------|-----------------------------|---------------------------------|
| TRIVIAL | 1 iteration | fast |
| SIMPLE | 1 iteration | balanced |
| MODERATE | 1 iteration | balanced |
| COMPLEX | 2 iterations | capable |
| CRITICAL | 3 iterations | capable |

The plan-checker model tier is set by the agent’s own definition.

**MANDATORY**: You MUST spawn the \`plan-reviewer\` subagent. Do NOT attempt to verify plans yourself.

BEFORE spawning the plan-reviewer, run the advisory linter against the written plan:

\`\`\`bash
luca plan lint --file "\${PHASE_DIR}/plan.md"
\`\`\`

The linter is warn-only (always exits 0 on lint findings) and checks mechanical conformance to the criteria grammar. The plan must carry a \`## Deliverables\` section mapping each explicit ask in the phase goal to its verification criteria; the linter warns on missing or malformed D-lines (canonical D-line grammar lives in the Architect mode plan template). Address each warning: fix the criterion, or justify the deviation in the plan's decisions/notes. Judgment checks — probe nameability, the A-passes-while-B-fails independence test — are the plan-reviewer's job, not the linter's; do not treat a clean lint as a substitute for review.

First, read the created plan (canonical: one \`plan.md\` per phase per LUCA_DIR_CONTRACT):

\`\`\`bash
PLAN_CONTENT=$(cat "\${PHASE_DIR}/plan.md" 2>/dev/null)
ROADMAP_CONTENT=$(cat .luca/roadmap.md)
# Recall requirements from MuninnDB (resolves the cached root ULID — recall_tree needs a ULID, not the concept):
# luca brain recall-root --concept brain:project-requirements
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
4. **Verification**: Does each task's Verification line reference ac-IDs from the ## Verification Criteria section? Does every criterion pass the Splitting Test (exactly one binary probe)? Is at least one anti-criterion (- **anti-NN**: MUST NOT — ...) present? Are IDs stable vs any prior revision (splits as ac-NN.M, drops tombstoned, never renumbered)?
5. **Goal Alignment**: Will executing these plans achieve the phase goal?
</verification_criteria>

<output_requirements>
- Return status: PASSED | ISSUES_FOUND
- If issues found, list specific problems with plan references
- Suggest fixes for each issue
</output_requirements>

Verify these plans will achieve the phase goal when executed.
""",
  subagent_type="plan-reviewer",
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
- [ ] plan-reviewer spawned (unless --skip-verify)
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

**Materialization note:** instruction-body changes (this skill, the architect mode) reach users via \`bun run build\` followed by a \`luca init\` re-run from the installed CLI — editing the source alone does not refresh deployed instruction bodies.
</main>
`

export const phasePlanSkill = defineSkill({
    name: 'phase-plan',
    description:
        'Create detailed plan.md execution plans for a specific phase with tasks, waves, and verification.',
    body: BODY,
})
