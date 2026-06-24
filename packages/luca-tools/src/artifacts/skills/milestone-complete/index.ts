/**
 * milestone-complete skill — Archive a completed milestone, extract learnings, and prepare for the next version.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/milestone-complete/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca Complete Milestone

Mark milestone complete, archive snapshots to \`.luca/milestones/\`, and reset the workflow state + roadmap for the next cycle.

**Arguments:** \`<version>\` (e.g., "1.0", "1.1", "2.0")

**Purpose:** Create historical record of shipped version, archive milestone artifacts (roadmap + requirements), and prepare for next milestone.

**Output:** Milestone archived (roadmap snapshot + backlog snapshot + audit), \`brain:project-identity\` MuninnDB tree evolved, learnings consolidated, git tagged.

## Learning Consolidation (NEW)

At milestone completion, consolidate all learnings:

### Step 0: Final Learning Extraction

Before archiving, ensure all session learnings are captured:

1. **Check for unextracted session learnings** in MuninnDB:

   \`\`\`
   mcp__muninn__muninn_recall(vault: "default", context: "current session context and unextracted findings")
   \`\`\`

2. **Invoke learner** if candidate learnings exist

3. **Review milestone-specific insights** in MuninnDB (recall the engrams first to get their ULIDs — there is no concept lookup):
   - Patterns validated multiple times -> promote trust tier via \`mcp__muninn__muninn_trust({ id: "<ULID>", trust: "verified" })\`. (The \`confidence\` field is set at creation and is NOT mutable by \`muninn_evolve\`; trust tier is the promotion mechanism. Use \`muninn_evolve\` only to update a flat engram's *content* by ULID.)
   - Decisions that held throughout the milestone -> \`muninn_trust\` to \`verified\`.
   - Pitfalls successfully avoided -> \`muninn_evolve\` (by ULID) to append a "validated" note to the flat pitfall engram.

### Step 1: Archive Milestone Memory

Create milestone-specific memory snapshot in MuninnDB:

\`\`\`
# Export milestone memory graph for archival
mcp__muninn__muninn_export_graph(vault: "default")
\`\`\`

Store the export as \`.luca/milestones/v{version}-backlog-snapshot.json\` (per LUCA_DIR_CONTRACT).

Include in archive:

- All patterns validated during this milestone
- Key decisions and their outcomes
- Pitfalls discovered and avoided

### Step 2: Clean Session State

After archiving, clear session context. \`mcp__muninn__muninn_forget\` requires an explicit engram **ULID** — there is NO wildcard/prefix forget, so \`id: "session:*"\` is a no-op. Recall the session engrams, then forget each by id:

\`\`\`
mcp__muninn__muninn_recall(vault: "<repo_vault>", context: ["session:"], mode: "recent", limit: 50)
# then, for each returned engram whose concept starts with "session:":
mcp__muninn__muninn_forget(vault: "<repo_vault>", id: "<that engram's ULID>")
\`\`\`

(\`session:*\` is project-scoped — it lives in the repo vault, not the shared \`default\` vault.)

Long-term learnings persist in MuninnDB across milestones.

## State Machine Integration

When updating state during milestone completion, use the \`luca\` CLI write surface:

\`\`\`bash
# Read current workflow state
STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
\`\`\`

After archiving the milestone, freeze the closing milestone's phase
directories and reset workflow state for the next milestone:

\`\`\`bash
# Move .luca/phases/<slug>/ → .luca/archive/<slug>/ so the next milestone's
# roadmap starts from an empty phases/ dir (per LUCA_DIR_CONTRACT). Idempotent;
# skips any slug already present under archive/. Do this BEFORE the next
# roadmap is created, or stale phase dirs collide on phase number with it.
luca phase archive 2>/dev/null || true

luca workflow reset 2>/dev/null || true
\`\`\`

Milestone identity (\`milestone:v<version>\`) is stored as an atomic engram in MuninnDB — there is no separate \`current_milestone\` state field on \`.luca/state.json\`. After completion, store the completed-milestone marker:

\`\`\`
mcp__muninn__muninn_remember(vault: "<repo_vault>", concept: "milestone:v{version}-complete", content: "<summary + outcomes>", tags: ["milestone","complete"])
\`\`\`

The durable milestone snapshot files (\`.luca/milestones/v<SEMVER>-{roadmap,audit,backlog-snapshot}.md\`) carry the human-readable archive.

## Process

0. **Check for audit:**

   - Look for \`.luca/milestones/v{version}-audit.md\`
   - If missing or stale: recommend \`/milestone-audit\` first
   - If audit status is \`gaps_found\`: recommend \`/milestone-gaps\` first
   - If audit status is \`passed\`: proceed

1. **Verify readiness:**

   - Check all phases have completed plans (SUMMARY.md exists)
   - Present milestone scope and stats
   - Wait for confirmation

2. **Gather stats:**

   - Count phases, plans, tasks
   - Calculate git range, file changes, LOC
   - Extract timeline from git log

3. **Extract accomplishments:**

   - Read all phase SUMMARY.md files
   - Extract 4-6 key accomplishments
   - Present for approval

4. **Archive milestone snapshot:**

   - Create \`.luca/milestones/v{version}-roadmap.md\` (snapshot of the closing roadmap)
   - Create \`.luca/milestones/v{version}-audit.md\` (milestone audit summary)
   - Create \`.luca/milestones/v{version}-backlog-snapshot.{json,md}\` (per LUCA_DIR_CONTRACT — captured in Step 2 above)
   - Reset the active roadmap via \`luca roadmap create --file <next-milestone.json>\` when a new milestone is ready; or leave the active roadmap empty until \`/milestone-new\`.

5. **Evolve requirements traceability in MuninnDB:**

   - Mark all v1 requirements as complete in \`brain:project-requirements\` (vault: repo vault)
   - The legacy hand-authored \`REQUIREMENTS.md\` has no canonical home; this step is a MuninnDB tree mutation only.

6. **Update project identity in MuninnDB:**

   - Update \`brain:project-identity\` to reflect the shipped version (add a \`current-version\` child, advance the milestone marker)
   - Set the next-milestone goals as an engram for the upcoming \`/milestone-new\` to pick up

7. **Commit and tag:**

   \`\`\`bash
   git add .
   git commit -m "chore(milestone): archive v{version} milestone"
   git tag -a v{version} -m "[milestone summary]"
   \`\`\`

   - Ask about pushing tag

8. **Offer next steps:**
   - \`/milestone-new\` — start next milestone

## Success Criteria

- [ ] Milestone snapshot archived to \`.luca/milestones/v{version}-roadmap.md\` + \`v{version}-audit.md\` + \`v{version}-backlog-snapshot.{json,md}\`
- [ ] Requirements traceability evolved in MuninnDB (\`brain:project-requirements\` v1 items marked complete)
- [ ] Active \`.luca/roadmap.md\` reset (or left empty until next milestone opens)
- [ ] \`brain:project-identity\` MuninnDB tree updated with current shipped version
- [ ] Git tag v{version} created
- [ ] Commit successful

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Ready for next milestone | Start new milestone | \`/milestone-new\` |
| Want to review completion | Check progress | \`/progress\` |
| Need to create PR | Create pull request | Run \`gh pr create\` |

**Primary:** \`/milestone-new\` — Start the next milestone cycle

**Also available:**

- \`/progress\` — Review completed work
- \`/help\` — See all available commands
</main>
`

export const milestoneCompleteSkill = defineSkill({
    name: 'milestone-complete',
    description:
        'Archive a completed milestone, extract learnings, and prepare for the next version.',
    body: BODY,
})
