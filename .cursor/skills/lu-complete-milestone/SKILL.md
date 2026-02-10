---
name: "lu-complete-milestone"
description: "Archive completed milestone and prepare for next version. Use when user wants to complete a milestone, mentions /lu-complete-milestone, or after all phases are done."
disable-model-invocation: true
---

<main>
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
   cat .planning/WORKING.md 2>/dev/null
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
# Clear WORKING.md for next milestone
cp .cursor/luca/templates/WORKING.md .planning/WORKING.md
```

MEMORY.md persists across milestones - it's the long-term project memory.

## Process

0. **Check for audit:**

   - Look for `.planning/v{version}-MILESTONE-AUDIT.md`
   - If missing or stale: recommend `/lu-audit-milestone` first
   - If audit status is `gaps_found`: recommend `/lu-plan-milestone-gaps` first
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
   - `/lu-new-milestone` — start next milestone

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
| Ready for next milestone | Start new milestone | `/lu-new-milestone` |
| Want to review completion | Check progress | `/lu-progress` |
| Need to create PR | Create pull request | Run `gh pr create` |

**Primary:** `/lu-new-milestone` — Start the next milestone cycle

**Also available:**

- `/lu-progress` — Review completed work
- `/lu-help` — See all available commands
</main>
</main>