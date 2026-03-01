# session-plan

Plan the next coding session using WSJF prioritization of pending todos and roadmap items.

## main

<main>
# Luca Session Planner

Plan the next AI coding session (or week) by analyzing pending todos, scoring them with WSJF, and scheduling an optimal session plan.

**Arguments:** `[sessions]` (optional - defaults to 1 for single session, use >1 for weekly planning)

## Process

### Step 0: Cognitive Pre-Flight

1. **Load context:**
   - Read `.planning/BRAIN.md` for project identity
   - Read working memory via bridge: `bun run src/memory/bridge.ts read-working` (fallback: cat .planning/WORKING.md)
   - Selective recall from memory via bridge: `bun run src/memory/bridge.ts read-memory --tags=planning,estimates,workflow --limit=10` (fallback: cat .planning/MEMORY.md)

2. **Initialize WORKING.md:**
   - Set session info: workflow=session-plan, started timestamp
   - Note any recalled calibration data for effort estimates

### Step 1: Parse Pending Todos

1. **Read backlog:**
   - Read all files from `.planning/todos/pending/*.md`
   - Extract YAML frontmatter (title, area, created, source) from each
   - Extract body content for task context

2. **Check for dependencies:**
   - Scan body content for references to other todos
   - Mark items as dependency_free=true if no unresolved prerequisites

3. **Display backlog summary:**
   - Show count of pending todos by area
   - Note any items with dependencies

### Step 2: Invoke PM Agent (lu-pm-planner)

1. **Prepare context for PM agent:**
   - Package TodoMetadata[] as structured input
   - Include `.planning/ROADMAP.md` for priority context
   - Include dependency graph
   - Include any MEMORY.md calibration entries for effort estimates (via bridge: `bun run src/memory/bridge.ts read-memory --tags=estimates,calibration --limit=5`)

2. **Spawn lu-pm-planner sub-agent:**
   - Agent infers WSJF inputs (BV, TC, RR) for each todo from context
   - Agent maps complexity to effort points
   - Agent computes WSJF scores and ranks items
   - Agent applies Big Rock First + WSJF tail scheduling
   - Agent assigns quality zones
   - Agent returns ResultEnvelope containing SessionPlan

3. **Receive and validate result:**
   - Parse ResultEnvelope from agent output
   - Validate SessionPlan schema
   - Extract any issues or warnings

### Step 3: Technical Review (Optional)

If `config.workflow.planner_review` is enabled (default: skip for now):

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

   ```
   Big Rock: "{title}" (WSJF {score}, {complexity})
   Scheduled in Peak Zone (0-30% context)
   ```

2. **Ordered task list with zones:**

   ```
   | # | Task | WSJF | Zone | Effort |
   |---|------|------|------|--------|
   | 1 | Big Rock task | 4.2 | peak | 5 |
   | 2 | Next task | 3.5 | good | 3 |
   | ... |
   ```

3. **Mermaid gantt chart** (from session plan)

4. **Rationale summary** (from PM agent)

5. **Deferred items** (not scheduled this session)

### Step 5: Weekly Planning (if sessions > 1)

If `{ARGUMENTS}` specifies more than 1 session:

1. Run `distributeWeekly(scored_items, sessions_count)` for multi-session planning
2. Display per-session breakdown with allocation percentages
3. Show weekly allocation: 60% needle movers, 25% quick wins, 10% maintenance, 5% reserve
4. Display deferred items that didn't fit in the weekly plan

</main>