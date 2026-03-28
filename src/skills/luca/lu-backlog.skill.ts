/**
 * lu-backlog Sub-Skill — Backlog scan, WSJF scoring, and roadmap revision.
 *
 * Extracts the backlog scan + roadmap revision sections from the monolithic lu skill.
 *
 * **Responsibility:** Scan MuninnDB for outstanding todos, perform WSJF scoring
 * of pending items, revise the roadmap (add/reorder phases), and optionally
 * use swarm mode for multi-specialist analysis.
 *
 * **Input:** None (reads pending todos from `.planning/todos/pending/`)
 * **Output:** Populated `lu_backlog` section in `/tmp/lu-context.json`
 *
 * This sub-skill is OPTIONAL. The orchestrator sends SKIP_BACKLOG when
 * `--skip-backlog` flag is set.
 *
 * This skill spawns sub-agents for roadmap revision (swarm or single agent).
 *
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 5
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const luBacklogConfig: SkillConfig = {
  frontmatter: {
    name: "lu-backlog",
    description:
      "Scan pending todos, WSJF score, and revise roadmap for the lu sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# lu-backlog — Backlog Scan & Roadmap Revision

Scan pending todos, detect unplanned work, WSJF score pending items, and revise the roadmap. Write results to the shared context file.

## Context File Protocol

This sub-skill is part of the lu chain. It reads/writes the shared context file at \`/tmp/lu-context.json\`.

**Read:** Call \`readLuContext()\` from \`src/skills/__schemas/lu-context.schemas.ts\`. If \`success: false\`, ABORT immediately.

**Write:** Call \`writeLuContext({ lu_backlog: { ... } })\` to populate the \`lu_backlog\` section.

## Process

### Step 1a: Read Pending Todos

\`\`\`bash
TODOS=$(ls .planning/todos/pending/*.md 2>/dev/null || echo "")
TODO_COUNT=$(echo "$TODOS" | grep -c '.' 2>/dev/null || echo "0")
\`\`\`

If TODO_COUNT == 0: Write results with \`todos_scanned: true\`, \`backlog_revised: false\`, \`phases_added: 0\` and return.

### Step 1b: Read ROADMAP.md

\`\`\`bash
ROADMAP_CONTENT=$(cat .planning/ROADMAP.md 2>/dev/null || echo "")
\`\`\`

### Step 1c: Detect Unplanned Work

For each todo file in \`.planning/todos/pending/\`:

1. Read the file content
2. Extract \`title\` from YAML frontmatter (between \`---\` delimiters)
3. Search ROADMAP_CONTENT for any reference to:
   - The todo's title (case-insensitive substring match)
   - The todo's filename (without .md extension)
4. If neither found: classify as **unplanned**
5. If found in a phase with \`- [ ]\` plans: classify as **planned but incomplete** (normal)

### Step 1d: Display Backlog Summary

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > BACKLOG SCAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{TODO_COUNT} pending todos found
{UNPLANNED_COUNT} not yet in roadmap
{PLANNED_INCOMPLETE} in roadmap, incomplete
\`\`\`

If UNPLANNED_COUNT == 0: Skip to Step 3 (no roadmap revision needed).

## Step 2: Roadmap Revision

**Only runs when unplanned todos exist (Step 1c found UNPLANNED_COUNT > 0).**

### 2a: Analyze Pending Todos

Read all todo contents for the prompt:

\`\`\`bash
TODO_CONTENTS=""
for f in .planning/todos/pending/*.md; do
  TODO_CONTENTS="$TODO_CONTENTS\\n---FILE: $f---\\n$(cat "$f")"
done
\`\`\`

**Branch based on SWARM_ENABLED:**

> **MANDATORY ROUTING — DO NOT SKIP OR SUBSTITUTE:**
> The path below is determined by the SWARM_ENABLED flag. If SWARM_ENABLED == true (the default), you MUST follow Path B and use TeamCreate. You MUST NOT substitute parallel Task calls for TeamCreate. Path A is ONLY valid when \`--no-swarm\` is explicitly passed or \`swarm_enabled: false\` is set in config.json.

---

#### Path A: Single-Agent (--no-swarm fallback)

**If SWARM_ENABLED == false:** Use lu-pm-planner for WSJF scoring and phase placement.

\`\`\`
Task(
  agent: "lu-pm-planner",
  prompt: """
<planning_context>
**Mode:** roadmap-revision (extended)

**All Pending Todos:**
{TODO_CONTENTS}

**Current ROADMAP.md:**
{ROADMAP_CONTENT}

**Current STATE.md:**
{STATE_CONTENT}

**Instructions:**
1. Score ALL pending todos by WSJF (Business Value + Time Criticality + Risk Reduction / Effort)
2. For todos already referenced in ROADMAP.md: validate their current priority ordering
3. For unplanned todos (not referenced in ROADMAP):
   a. Determine if the todo fits the scope of an existing incomplete phase
   b. If yes: recommend adding it to that phase
   c. If no: group related unplanned todos into proposed new phases with goals
   d. If a todo is COMPLEX/CRITICAL or architecturally distinct: flag it for potential new milestone
4. Return a revised phase ordering with WSJF rationale
5. Provide dependency recommendations for new phases

**Output:** ResultEnvelope with:
- status: "success"
- summary: Human-readable revision proposal
- artifacts: Each proposed change (new phases, reordered phases, todos absorbed)
- issues: Any warnings (dependency conflicts, milestone-worthy items, estimation uncertainty)
</planning_context>
"""
)
\`\`\`

---

#### Path B: Team-Based Swarm (default)

**If SWARM_ENABLED == true (default):** Use a 3-specialist + 1-synthesizer swarm.

1. **TeamCreate** with name "roadmap-revision-{timestamp}"
2. **Spawn 3 specialists in parallel** via Task():
   - lu-roadmap-architect (architectural impact analysis)
   - lu-roadmap-prioritizer (WSJF scoring and prioritization)
   - lu-roadmap-qa (QA and testing gap analysis)
3. **Collect specialist ResultEnvelopes** (10-minute timeout, graceful degradation)
4. **Spawn synthesizer** (lu-roadmap-synthesizer) to merge analyses
5. **Cleanup:** SendMessage shutdown_request to all specialists + TeamDelete()

### 2b: Present Proposed Changes

Display the proposal ResultEnvelope with summary and change table.

### 2c: Oversight Gate

- If OVERSIGHT == "full-auto" or "flagged": auto-approve all changes
- If OVERSIGHT == "milestone" or "phase": present changes and ask user

### 2d: Apply Changes

If approved:
1. Update ROADMAP.md with new/reordered phases
2. Create phase directories: \`mkdir -p .planning/phases/{NN}-{phase-name}\`
3. Commit changes

### 2e: GitHub Issue & Branch

Ensure a GitHub issue and feature branch exist for the milestone. Auto-create or prompt based on oversight level.

### Step 3: Write Results to Context File

\`\`\`typescript
writeLuContext({
  lu_backlog: {
    todos_scanned: true,
    wsjf_scored: <true if WSJF scoring ran>,
    backlog_revised: <true if roadmap was updated>,
    phases_added: <count of new phases added>,
  },
});
\`\`\`

## Completion

After writing results, return to the lu orchestrator. The orchestrator will write \`current_state: "scanned"\` and invoke lu-phase-loop next.
</main>`,
      order: 1,
    },
  ],
};

export const luBacklogSkill = createSkill(luBacklogConfig);
