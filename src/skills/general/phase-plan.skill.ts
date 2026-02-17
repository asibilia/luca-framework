/**
 * phase-plan Skill - Create detailed PLAN.md execution plans for a specific phase with tasks, waves, and verification.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the phase-plan skill configuration
const phasePlanConfig: SkillConfig = {
  frontmatter: {
    name: "phase-plan",
    description: `Create detailed PLAN.md execution plans for a specific phase with tasks, waves, and verification.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Plan Phase

Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research and verification.

**Default flow:** Cognitive Pre-Flight → Research (if needed) → Plan → Verify → Done

**Arguments:** \`[phase] [--research] [--skip-research] [--gaps] [--skip-verify] [--skip-memory]\`

## Sub-agent Delegation Requirements

This skill is an **orchestrator**. YOU MUST delegate work to sub-agents using the Task tool.

**Required sub-agents for this skill:**

- \`lu-phase-researcher\` - Researches implementation approaches before planning
- \`lu-planner\` - Creates PLAN.md files with task breakdowns
- \`lu-plan-checker\` - Validates plans before execution

**DO NOT** attempt to research, plan, or verify plans yourself. Spawn the appropriate agents.

**Reference:** See \`.cursor/luca/references/task-directive.md\` for Task() syntax patterns.

## Execution Context

Read this reference file before executing:

- \`.cursor/luca/references/ui-brand.md\`
- \`.cursor/luca/workflows/cognitive-preflight.md\`

## Cognitive Pre-Flight (NEW)

Before planning begins, run cognitive pre-flight:

### Step 0: Load Cognitive Context

**Unless \`--skip-memory\` is passed:**

1. **Load BRAIN.md** for project conventions:

   \`\`\`bash
   cat .planning/BRAIN.md 2>/dev/null
   \`\`\`

   Extract: architecture patterns, code conventions, development preferences

2. **Selective recall from MEMORY.md** based on phase keywords:

   \`\`\`bash
   # Extract phase description and search MEMORY.md
   PHASE_DESC=$(grep -A5 "Phase \${PHASE}:" .planning/ROADMAP.md)
   \`\`\`

   Look for: relevant patterns, past decisions, known pitfalls

2.5. **Recall relevant procedures from PROCEDURES.md**:

   \\\`\\\`\\\`bash
   # Primary: Scored procedure recall via memory bridge (filters active, scores by relevance)
   PROCEDURES_JSON=\$(bun run src/memory/bridge.ts read-procedures --query="{phase_description}" --tags={phase_tags} --limit=5 2>/dev/null || echo '{"entries":[]}')
   # Fallback: Read PROCEDURES.md directly
   PROCEDURES_CONTENT=\$(cat .planning/PROCEDURES.md 2>/dev/null || echo "")
   \\\`\\\`\\\`

   The bridge automatically filters active procedures and scores by relevance:
   - Tag overlap with phase keywords (40% weight)
   - Trigger similarity to phase description (40% weight)
   - Historical success rate (20% weight)

   Procedures are step-sequence templates from past successful executions.
   The planner should consider them as starting points for task breakdown.

3. **Initialize WORKING.md** for this planning session:

   \`\`\`markdown
   # Working Memory

   ## Session Info

   - **Started**: [timestamp]
   - **Workflow**: /phase-plan
   - **Phase**: [phase number]

   ## Memory Recall

   - **Patterns**: [relevant patterns from MEMORY.md]
   - **Decisions**: [relevant decisions]
   - **Pitfalls**: [flagged pitfalls]
   - **Procedures**: [relevant procedures from PROCEDURES.md]

   ## Planning Notes

   <!-- Log planning decisions as they're made -->
   \`\`\`

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
ls .planning/ 2>/dev/null
\`\`\`

If not found: Error - user should run \`/project-new\` first.

**Resolve model profile for agent spawning:**

\`\`\`bash
MODEL_PROFILE=$(cat .planning/config.json 2>/dev/null | grep -o '"model_profile"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "balanced")
\`\`\`

**Model lookup table:**

| Agent                  | quality | balanced | budget |
| ---------------------- | ------- | -------- | ------ |
| lu-phase-researcher | opus    | sonnet   | haiku  |
| lu-planner          | opus    | opus     | sonnet |
| lu-plan-checker     | sonnet  | sonnet   | haiku  |

> **Current Limitation:** Cursor's Task tool only supports \`model="fast"\` or inheriting from parent. This table is preserved for future compatibility.

**Current model variable values:**

\`\`\`
# All agents in plan-phase require reasoning → omit (inherit from parent)
researcher_model = (omit)
planner_model = (omit)
checker_model = (omit)
\`\`\`

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
grep -A5 "Phase \${PHASE}:" .planning/ROADMAP.md 2>/dev/null
\`\`\`

If not found: Error with available phases. If found: Extract phase number, name, description.

### 4. Ensure Phase Directory Exists

\`\`\`bash
PHASE_DIR=$(ls -d .planning/phases/\${PHASE}-* 2>/dev/null | head -1)
if [ -z "$PHASE_DIR" ]; then
  PHASE_NAME=$(grep "Phase \${PHASE}:" .planning/ROADMAP.md | sed 's/.*Phase [0-9]*: //' | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  mkdir -p ".planning/phases/\${PHASE}-\${PHASE_NAME}"
  PHASE_DIR=".planning/phases/\${PHASE}-\${PHASE_NAME}"
fi
\`\`\`

### 5. Handle Research

**If \`--gaps\` flag:** Skip research (gap closure uses VERIFICATION.md instead).

**If \`--skip-research\` flag:** Skip to step 6.

**Complexity gate:** Research is skipped for TRIVIAL and SIMPLE levels, optional for MODERATE, required for COMPLEX and CRITICAL.

| Complexity | Research |
|------------|----------|
| TRIVIAL | Skip |
| SIMPLE | Skip |
| MODERATE | Run if \`workflow.research: true\` (default) |
| COMPLEX | Always run |
| CRITICAL | Always run |

Read complexity from bridge (falls back to STATE.md \`Task Complexity:\` field):

\`\`\`bash
COMPLEXITY=$(bun run packages/luca-state/src/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
\`\`\`

If TRIVIAL or SIMPLE, skip to step 6 (equivalent to --skip-research).

**Check config for research setting:**

\`\`\`bash
WORKFLOW_RESEARCH=$(cat .planning/config.json 2>/dev/null | grep -o '"research"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true|false' || echo "true")
\`\`\`

**MANDATORY**: If research is needed, you MUST spawn a lu-phase-researcher sub-agent. Do NOT attempt to research yourself.

First, read the required context:

\`\`\`bash
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
# Primary: Read state from state machine bridge
STATE_JSON=$(bun run packages/luca-state/src/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
CONTEXT_CONTENT=$(cat .planning/CONTEXT.md 2>/dev/null || echo "No context file")
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
- Create RESEARCH.md in phase directory
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
ls "\${PHASE_DIR}"/*-PLAN.md 2>/dev/null
\`\`\`

If exists: Offer to continue planning, view existing, or replan from scratch.

### 7. Read Context Files

Read and store context file contents for the planner agent:

- STATE.md, ROADMAP.md
- REQUIREMENTS.md, CONTEXT.md, RESEARCH.md (if exist)
- VERIFICATION.md, UAT.md (if --gaps mode)

### 8. Spawn lu-planner Agent

Display stage banner:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning planner...
\`\`\`

**MANDATORY**: You MUST spawn a lu-planner sub-agent. Do NOT attempt to create plans yourself.

First, read all context files (already done in step 7):

\`\`\`bash
# Primary: Read state from state machine bridge
STATE_JSON=$(bun run packages/luca-state/src/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_CONTENT=$(cat .planning/STATE.md)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
RESEARCH_CONTENT=$(cat "\${PHASE_DIR}/RESEARCH.md" 2>/dev/null || echo "No research file")
VERIFICATION_CONTENT=$(cat "\${PHASE_DIR}/VERIFICATION.md" 2>/dev/null || echo "")  # For gaps mode
# Primary: Read working memory from memory bridge
WORKING_JSON=$(bun run src/memory/bridge.ts read-working 2>/dev/null || echo '{"sections":[],"total_tokens":0,"status":"cleared"}')
# Fallback: Read WORKING.md directly
WORKING_CONTENT=$(cat .planning/WORKING.md 2>/dev/null || echo "")
\`\`\`

Then spawn the planner:

\`\`\`python
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

**Complexity gate:** Plan verification is skipped for TRIVIAL and SIMPLE, runs with scaled iterations for MODERATE and above.

| Complexity | Plan Verification |
|------------|------------------|
| TRIVIAL | Skip entirely |
| SIMPLE | Skip entirely |
| MODERATE | 1 iteration |
| COMPLEX | 2 iterations |
| CRITICAL | 3 iterations |

If complexity is TRIVIAL or SIMPLE: Skip steps 10-12 entirely (no plan-checker, no revision loop). Proceed directly to step 13 (Present Final Status).

**MANDATORY**: You MUST spawn a lu-plan-checker sub-agent. Do NOT attempt to verify plans yourself.

First, read the created plans:

\`\`\`bash
PLANS_CONTENT=$(find "\${PHASE_DIR}" -name "*-PLAN.md" -exec cat {} ;)
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md)
REQUIREMENTS_CONTENT=$(cat .planning/REQUIREMENTS.md 2>/dev/null || echo "No requirements file")
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

Max iterations from complexity matrix (default 3 if no complexity set):

| Complexity | Max Revisions |
|------------|--------------|
| MODERATE | 1 |
| COMPLEX | 2 |
| CRITICAL | 3 |

If issues found and iteration_count < max_revisions:

- Spawn lu-planner with revision context
- Re-verify with checker
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
| Plans created successfully | Execute the phase | \`/phase-execute {phase}\` |
| Want to review plans first | Check progress    | \`/progress\`              |
| Need more context          | Discuss the phase | \`/phase-discuss {phase}\` |

**Primary:** \`/phase-execute {phase}\` — Run all plans in the phase

**Also available:**

- \`/progress\` — See plan details before executing
- \`/phase-discuss {phase}\` — Gather more context if plans seem off
</main>`,
      order: 1,
    },
  ],
};

export class PhasePlanSkill extends BaseSkillImpl {
  constructor() {
    super(phasePlanConfig);
  }
}
