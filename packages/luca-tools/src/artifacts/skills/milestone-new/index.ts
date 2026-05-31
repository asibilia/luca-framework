/**
 * milestone-new skill — Start a new milestone cycle with requirements gathering and roadmap generation.
 *
 * Ported from fd0b169be:packages/luca-framework/.cursor/skills/milestone-new/SKILL.md (pre-D-4) (E-5).
 * Body path-retargeting: .planning/ → .luca/; uppercase artifacts
 * (PLAN.md, RESEARCH.md, CONTEXT.md, POSTMORTEM.md) → LUCA_DIR_CONTRACT
 * canonicals (plan.md, research.md, context.md, learn.md).
 */
import { defineSkill } from '../../../define/skill.ts'

const BODY = `<main>
# Luca New Milestone

Start a new milestone through unified flow: questioning → research (optional) → requirements → roadmap.

This is the brownfield equivalent of new-project. The project exists, the \`brain:project-identity\` MuninnDB tree has history. This command gathers "what's next", evolves \`brain:project-identity\`, then continues through the full requirements → roadmap cycle.

**Arguments:** \`[milestone name, e.g., 'v1.1 Notifications']\`

## Creates/Updates

- MuninnDB \`brain:project-identity\` — updated with new milestone marker + goals
- MuninnDB \`brain:project-requirements\` — scoped requirements for this milestone (REQ-IDs continue from prior milestone)
- MuninnDB \`research:milestone-<slug>:*\` — domain research (optional, focuses on NEW features)
- \`.luca/roadmap.md\` — phase structure (continues numbering, written via \`luca roadmap create\` if resetting or hand-edited if extending)
- \`.luca/state.json\` — reset for new milestone via \`luca workflow reset\`

**After this command:** Run \`/phase-plan [N]\` to start execution.

## Process

1. **Load Context** — Read project identity from MuninnDB (\`brain:project-identity\`), prior milestone snapshots under \`.luca/milestones/\`, and the current workflow state:

   \`\`\`bash
   STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
   \`\`\`

2. **Gather Milestone Goals** — Recall any per-milestone discussion context from MuninnDB (\`milestone:<slug>\`), or question user
3. **Determine Milestone Version** — Parse last version from \`.luca/milestones/\` snapshots, suggest next
4. **Update project identity in MuninnDB** — Store the current milestone marker:

   \`\`\`
   mcp__muninn__muninn_remember(vault: "<repo_vault>", concept: "milestone:v{version}", content: "<milestone goals + scope>", tags: ["milestone","active"])
   \`\`\`

5. **Reset workflow state for new milestone:**

   \`\`\`bash
   luca workflow reset 2>/dev/null || true
   # The freshly reset state defaults to pipelineStep=triage. The milestone identifier is captured via MuninnDB (above), not as a state field.
   \`\`\`

6. **Research Decision** — Spawn researchers if selected (milestone-aware context)
7. **Define Requirements** — Present features, scope each category
8. **Create Roadmap** — Use \`luca roadmap create\` (continues phase numbering)
9. **GitHub Issue & Branch Decision** — See below
10. **Done** — Present completion with next steps

## GitHub Issue & Branch Decision (Step 9)

After roadmap creation, present the user with tracking options:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► MILESTONE TRACKING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

How should this milestone be tracked on GitHub?

1. **New issue & branch** — Create dedicated issue for this milestone
2. **Continue on #{existing}** — Keep using existing issue/branch
3. **No tracking** — Skip GitHub integration (not recommended)
\`\`\`

**If "New issue & branch" selected:**

1. Generate issue body from MuninnDB recall (\`brain:project-identity\` current-milestone child + \`brain:project-requirements\` v-current scope)
2. Create issue: \`gh issue create --title "feat({scope}): {milestone-name}" --body "{body}"\`
3. Create branch: \`git checkout -b {issue_number}--{milestone-slug}\`
4. Push branch: \`git push -u origin {branch_name}\`
5. Record the issue/branch references in MuninnDB so the active session has durable context:

   \`\`\`
   mcp__muninn__muninn_remember(
     vault: "<repo_vault>",
     concept: "session:milestone-v{version}",
     content: "GitHub issue #{issue_number} / branch {branch_name} — milestone v{version}",
     tags: ["session","milestone","github"]
   )
   \`\`\`

**If "Continue on existing" selected:**

1. Verify existing issue still open: \`gh issue view {number} --json state\`
2. Add comment to existing issue noting new milestone started
3. Keep existing issue/branch references in MuninnDB (no state update needed)

**If "No tracking" selected:**

1. Warn user: commits won't reference issues, PR creation will require manual setup
2. Note: GitHub Issue: None (user opted out) — no bridge update needed

## Success Criteria

- [ ] MuninnDB \`brain:project-identity\` updated with current-milestone marker
- [ ] \`.luca/state.json\` reset for new milestone (via \`luca workflow reset\`)
- [ ] Prior milestone-context engrams consumed (recalled into the new milestone's planning)
- [ ] Research completed (if selected) — 4 parallel agents spawned, milestone-aware
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category
- [ ] MuninnDB \`brain:project-requirements\` updated with new milestone's REQ-IDs
- [ ] \`.luca/roadmap.md\` created with phases continuing from previous milestone
- [ ] GitHub tracking decision made (new issue, continue existing, or opt-out)
- [ ] Issue/branch tracking captured in MuninnDB \`session:milestone-*\` engram (when tracking opted in)

## Next Steps

| Condition | Action | Command |
|-----------|--------|---------|
| Milestone created | Discuss first phase | \`/phase-discuss {N}\` |
| Want to skip discussion | Plan directly | \`/phase-plan {N}\` |
| Need codebase context | Map the codebase | \`/codebase-map\` |

**Primary:** \`/phase-discuss {N}\` — Gather context for first phase of milestone

**Also available:**

- \`/phase-plan {N}\` — Skip discussion, plan directly
- \`/progress\` — Check milestone setup
</main>
`

export const milestoneNewSkill = defineSkill({
    name: "milestone-new",
    description: "Start a new milestone cycle with requirements gathering and roadmap generation.",
    body: BODY,
})
