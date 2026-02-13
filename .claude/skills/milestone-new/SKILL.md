# milestone-new

Start a new milestone cycle with requirements gathering and roadmap generation.

## main

<main>
# Luca New Milestone

Start a new milestone through unified flow: questioning → research (optional) → requirements → roadmap.

This is the brownfield equivalent of new-project. The project exists, PROJECT.md has history. This command gathers "what's next", updates PROJECT.md, then continues through the full requirements → roadmap cycle.

**Arguments:** `[milestone name, e.g., 'v1.1 Notifications']`

## Creates/Updates

- `.planning/PROJECT.md` — updated with new milestone goals
- `.planning/research/` — domain research (optional, focuses on NEW features)
- `.planning/REQUIREMENTS.md` — scoped requirements for this milestone
- `.planning/ROADMAP.md` — phase structure (continues numbering)
- `.planning/STATE.md` — reset for new milestone

**After this command:** Run `/phase-plan [N]` to start execution.

## Execution Context

Read these reference files before executing:

- `.cursor/luca/references/questioning.md`
- `.cursor/luca/references/ui-brand.md`
- `.cursor/luca/templates/project.md`
- `.cursor/luca/templates/requirements.md`

## Process

1. **Load Context** — Read PROJECT.md, MILESTONES.md, STATE.md
2. **Gather Milestone Goals** — Use MILESTONE-CONTEXT.md if exists, or question user
3. **Determine Milestone Version** — Parse last version, suggest next
4. **Update PROJECT.md** — Add Current Milestone section
5. **Update STATE.md** — Reset for new milestone
6. **Research Decision** — Spawn researchers if selected (milestone-aware context)
7. **Define Requirements** — Present features, scope each category
8. **Create Roadmap** — Spawn lu-roadmapper (continues phase numbering)
9. **GitHub Issue & Branch Decision** — See below
10. **Done** — Present completion with next steps

## GitHub Issue & Branch Decision (Step 9)

After roadmap creation, present the user with tracking options:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► MILESTONE TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

How should this milestone be tracked on GitHub?

1. **New issue & branch** — Create dedicated issue for this milestone
2. **Continue on #{existing}** — Keep using existing issue/branch
3. **No tracking** — Skip GitHub integration (not recommended)
```

**If "New issue & branch" selected:**

1. Generate issue body from PROJECT.md (Current Milestone section), REQUIREMENTS.md summary
2. Create issue: `gh issue create --title "feat({scope}): {milestone-name}" --body "{body}"`
3. Create branch: `git checkout -b {issue_number}--{milestone-slug}`
4. Push branch: `git push -u origin {branch_name}`
5. Update STATE.md with new issue/branch references

**If "Continue on existing" selected:**

1. Verify existing issue still open: `gh issue view {number} --json state`
2. Add comment to existing issue noting new milestone started
3. Keep STATE.md issue/branch as-is

**If "No tracking" selected:**

1. Warn user: commits won't reference issues, PR creation will require manual setup
2. Update STATE.md to note: `GitHub Issue: None (user opted out)`

## Success Criteria

- [ ] PROJECT.md updated with Current Milestone section
- [ ] STATE.md reset for new milestone
- [ ] MILESTONE-CONTEXT.md consumed and deleted (if existed)
- [ ] Research completed (if selected) — 4 parallel agents spawned, milestone-aware
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category
- [ ] REQUIREMENTS.md created with REQ-IDs
- [ ] ROADMAP.md created with phases continuing from previous milestone
- [ ] GitHub tracking decision made (new issue, continue existing, or opt-out)
- [ ] STATE.md reflects issue/branch tracking status

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Milestone created | Discuss first phase | `/phase-discuss {N}` |
| Want to skip discussion | Plan directly | `/phase-plan {N}` |
| Need codebase context | Map the codebase | `/codebase-map` |

**Primary:** `/phase-discuss {N}` — Gather context for first phase of milestone

**Also available:**

- `/phase-plan {N}` — Skip discussion, plan directly
- `/progress` — Check milestone setup
</main>