---
name: milestone-complete
description: Archive a completed milestone, extract learnings, and prepare for the next version.
disable-model-invocation: true
---

<main>
# Luca Complete Milestone

Mark milestone complete, archive to milestones/, and update ROADMAP.md and REQUIREMENTS.md.

**Arguments:** `<version>` (e.g., "1.0", "1.1", "2.0")

**Purpose:** Create historical record of shipped version, archive milestone artifacts (roadmap + requirements), and prepare for next milestone.

**Output:** Milestone archived (roadmap + requirements), PROJECT.md evolved, learnings consolidated, git tagged.

## Execution Context

Read these reference files before executing:

- `.cursor/luca/workflows/complete-milestone.md`
- `.cursor/luca/templates/milestone-archive.md`
- `.cursor/luca/workflows/learning-capture.md`

## Learning Consolidation (NEW)

At milestone completion, consolidate all learnings:

### Step 0: Final Learning Extraction

Before archiving, ensure all session learnings are captured:

1. **Check WORKING.md** for unextracted learnings:

   ```bash
   # Primary: Read working memory from memory bridge
   bun run src/memory/__helpers/bridge.ts read-working 2>/dev/null || cat .planning/WORKING.md 2>/dev/null
   ```

2. **Invoke lu-learner** if candidate learnings exist

3. **Review MEMORY.md** for milestone-specific insights:
   - Patterns that were validated multiple times → bump to High confidence
   - Decisions that held throughout milestone → mark as Established
   - Pitfalls that were successfully avoided → note as Validated

### Step 1: Archive Milestone Memory

Create milestone-specific memory snapshot:

```bash
# Archive current MEMORY.md state
cp .planning/MEMORY.md .planning/milestones/v{version}-MEMORY-SNAPSHOT.md
```

Include in archive:

- All patterns validated during this milestone
- Key decisions and their outcomes
- Pitfalls discovered and avoided

### Step 2: Clean Session State

After archiving:

```bash
# Primary: Clear WORKING.md via memory bridge
bun run src/memory/__helpers/bridge.ts clear-working 2>/dev/null || true
# Fallback: Reset from template
cp .cursor/luca/templates/WORKING.md .planning/WORKING.md
```

MEMORY.md persists across milestones - it's the long-term project memory.

## State Machine Integration

When updating state during milestone completion, use the bridge CLI as primary with STATE.md fallback:

```bash
# Read current state
STATE_JSON=$(bun run packages/luca-framework/src/state/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly
STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
```

After archiving the milestone, reset state for the next milestone:

```bash
# Reset state machine for next milestone
bun run packages/luca-framework/src/state/bridge.ts transition --event=RESET 2>/dev/null || true
bun run packages/luca-framework/src/state/bridge.ts ensure-init --force 2>/dev/null || true
bun run packages/luca-framework/src/state/bridge.ts set-field --field=current_milestone --value="Planning next" 2>/dev/null || true
bun run packages/luca-framework/src/state/bridge.ts snapshot 2>/dev/null || true
# Fallback: Update STATE.md directly if bridge unavailable
```

The bridge `snapshot` command automatically preserves the "Previous Milestones" section when regenerating STATE.md. Manually append the completed milestone to "Previous Milestones" before calling snapshot.

## Process

0. **Check for audit:**

   - Look for `.planning/v{version}-MILESTONE-AUDIT.md`
   - If missing or stale: recommend `/milestone-audit` first
   - If audit status is `gaps_found`: recommend `/milestone-gaps` first
   - If audit status is `passed`: proceed

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

4. **Archive milestone:**

   - Create `.planning/milestones/v{version}-ROADMAP.md`
   - Fill milestone-archive.md template
   - Update ROADMAP.md to one-line summary with link

5. **Archive requirements:**

   - Create `.planning/milestones/v{version}-REQUIREMENTS.md`
   - Mark all v1 requirements as complete
   - Delete `.planning/REQUIREMENTS.md` (fresh one created for next milestone)

6. **Update PROJECT.md:**

   - Add "Current State" section with shipped version
   - Add "Next Milestone Goals" section

7. **Commit and tag:**

   ```bash
   git add .
   bun run commit --message="archive v{version} milestone" --type=chore --scope=milestone --no-push --skip-checks
   git tag -a v{version} -m "[milestone summary]"
   ```

   - Ask about pushing tag

8. **Offer next steps:**
   - `/milestone-new` — start next milestone

## Success Criteria

- [ ] Milestone archived to `.planning/milestones/v{version}-ROADMAP.md`
- [ ] Requirements archived to `.planning/milestones/v{version}-REQUIREMENTS.md`
- [ ] `.planning/REQUIREMENTS.md` deleted (fresh for next milestone)
- [ ] ROADMAP.md collapsed to one-line entry
- [ ] PROJECT.md updated with current state
- [ ] Git tag v{version} created
- [ ] Commit successful

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Ready for next milestone | Start new milestone | `/milestone-new` |
| Want to review completion | Check progress | `/progress` |
| Need to create PR | Create pull request | Run `gh pr create` |

**Primary:** `/milestone-new` — Start the next milestone cycle

**Also available:**

- `/progress` — Review completed work
- `/help` — See all available commands
</main>