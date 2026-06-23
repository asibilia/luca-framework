/**
 * session-plan skill — Plan the next coding session using WSJF prioritization of pending todos and roadmap items.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/session-plan/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Session Planner

Plan the next AI coding session (or week) by analyzing pending todos, scoring them with WSJF, and scheduling an optimal session plan.

**Arguments:** \`[sessions]\` (optional - defaults to 1 for single session, use >1 for weekly planning)

## Process

### Step 0: Cognitive Pre-Flight

1. **Load context from MuninnDB:**
   - Recall project identity: \`luca brain recall-root --concept brain:project-identity\` (follow the emitted recall_tree procedure — it resolves the cached root ULID in the repo vault; do NOT pass the concept to recall_tree directly)
   - Recall session context: \`mcp__muninn__muninn_recall(vault: "default", context: "current session context")\`
   - Recall planning patterns: \`mcp__muninn__muninn_recall(vault: "default", context: "planning patterns, estimates, and workflow decisions")\`

2. **Initialize session in MuninnDB:**
   - Store session info: \`mcp__muninn__muninn_remember(vault: "<repo_vault>", concept: "session:info", content: "workflow=session-plan, started=[timestamp]")\` (\`session:*\` is project-scoped → repo vault, not \`default\`)
   - Note any recalled calibration data for effort estimates

### Step 1: Parse Pending Todos

1. **Read backlog:**
   - Run \`luca todo list --status pending\` — it emits a \`muninn_recall_tree\` procedure (resolve the cached backlog root, walk the tree, \`muninn_read\` each non-deleted child); follow it exactly, or handle the plain "not initialized" notice if the backlog is empty
   - Each child's \`content\` is a JSON payload with title, body, status, source, and now priority and area
   - Filters (\`--status\`, \`--area\`, \`--priority\`) are applied post-read against each todo's content
   - The backlog is MuninnDB-backed; \`luca todo\` is the canonical surface

2. **Check for dependencies:**
   - Scan body content for references to other todos
   - Mark items as dependency_free=true if no unresolved prerequisites

3. **Display backlog summary:**
   - Show count of pending todos by area
   - Note any items with dependencies

### Step 2: Invoke the planner (\`architect\`) for WSJF prioritization

1. **Prepare planning context:**
   - Package TodoMetadata[] as structured input
   - Include \`.luca/roadmap.md\` for priority context
   - Include dependency graph
   - Include any calibration entries for effort estimates (via MuninnDB: \`mcp__muninn__muninn_recall(vault: "default", context: "effort estimates and calibration data")\`)

2. **Spawn the \`architect\` mode-agent** (v13 does planning/prioritization work through the architect; the v12-era \`lu-pm-planner\` subagent was dropped), with a WSJF-prioritization brief instructing it to:
   - Infer WSJF inputs (BV, TC, RR) for each todo from context
   - Map complexity to effort points
   - Compute WSJF scores and rank items
   - Apply Big Rock First + WSJF tail scheduling
   - Assign quality zones
   - Return a ResultEnvelope containing the SessionPlan

3. **Receive and validate result:**
   - Parse ResultEnvelope from agent output
   - Validate SessionPlan schema
   - Extract any issues or warnings

### Step 3: Technical Review (Optional)

If \`config.workflow.planner_review\` is enabled (default: skip for now):

1. **Pass session plan to code-architect:**
   - Review dependency ordering correctness
   - Validate effort estimates against historical data
   - Check for hidden blockers or missing prerequisites
   - Suggest reordering if technically warranted

2. **Incorporate review feedback:**
   - Append review comments to session plan rationale
   - Flag any items the reviewer flagged as risky

### Step 4: Present Session Plan

Display the session plan to the user:

1. **Big Rock callout:**

   \`\`\`
   Big Rock: "{title}" (WSJF {score}, {complexity})
   Scheduled in Peak Zone (0-30% context)
   \`\`\`

2. **Ordered task list with zones:**

   \`\`\`
   | # | Task | WSJF | Zone | Effort |
   |---|------|------|------|--------|
   | 1 | Big Rock task | 4.2 | peak | 5 |
   | 2 | Next task | 3.5 | good | 3 |
   | ... |
   \`\`\`

3. **Mermaid gantt chart** (from session plan)

4. **Rationale summary** (from PM agent)

5. **Deferred items** (not scheduled this session)

### Step 5: Weekly Planning (if sessions > 1)

If \`{ARGUMENTS}\` specifies more than 1 session:

1. Run \`distributeWeekly(scored_items, sessions_count)\` for multi-session planning
2. Display per-session breakdown with allocation percentages
3. Show weekly allocation: 60% needle movers, 25% quick wins, 10% maintenance, 5% reserve
4. Display deferred items that didn't fit in the weekly plan

</main>
`

export const sessionPlanSkill = defineSkill({
    name: "session-plan",
    description: "Plan the next coding session using WSJF prioritization of pending todos and roadmap items.",
    body: BODY,
})
