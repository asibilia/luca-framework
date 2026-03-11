/**
 * milestone-new Skill - Start a new milestone cycle with requirements gathering and roadmap generation.
 */
import { createSkill } from "~/skills/__helpers/create-skill";
import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

// Define the milestone-new skill configuration
const milestoneNewConfig: SkillConfig = {
  frontmatter: {
    name: "milestone-new",
    description: `Start a new milestone cycle with requirements gathering and roadmap generation.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca New Milestone

Start a new milestone through unified flow: questioning → research (optional) → requirements → roadmap.

This is the brownfield equivalent of new-project. The project exists, PROJECT.md has history. This command gathers "what's next", updates PROJECT.md, then continues through the full requirements → roadmap cycle.

**Arguments:** \`[milestone name, e.g., 'v1.1 Notifications']\`

## Creates/Updates

- \`.planning/PROJECT.md\` — updated with new milestone goals
- \`.planning/research/\` — domain research (optional, focuses on NEW features)
- \`.planning/REQUIREMENTS.md\` — scoped requirements for this milestone
- \`.planning/ROADMAP.md\` — phase structure (continues numbering)
- \`.planning/STATE.md\` — reset for new milestone

**After this command:** Run \`/phase-plan [N]\` to start execution.

## Execution Context

Read these reference files before executing:

- \`.cursor/luca/references/questioning.md\`
- \`.cursor/luca/references/ui-brand.md\`
- \`.cursor/luca/templates/project.md\`
- \`.cursor/luca/templates/requirements.md\`

## Process

1. **Load Context** — Read PROJECT.md, MILESTONES.md, STATE.md

   \`\`\`bash
   # Primary: Read state from bridge (typed, validated)
   STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
   # Fallback: Read STATE.md directly (backward compatibility)
   STATE_CONTENT=$(cat .planning/STATE.md 2>/dev/null || echo "")
   \`\`\`

2. **Gather Milestone Goals** — Use MILESTONE-CONTEXT.md if exists, or question user
3. **Determine Milestone Version** — Parse last version, suggest next
4. **Update PROJECT.md** — Add Current Milestone section
5. **Reset state for new milestone:**

   \`\`\`bash
   # Primary: Reset state machine and reinitialize for new milestone
   luca-bridge transition --event=RESET 2>/dev/null || true
   luca-bridge ensure-init --force 2>/dev/null || true
   luca-bridge set-field --field=current_milestone --value="v{version}" 2>/dev/null || true
   luca-bridge snapshot 2>/dev/null || true
   # Fallback: Update STATE.md directly if bridge unavailable
   \`\`\`

6. **Research Decision** — Spawn researchers if selected (milestone-aware context)
7. **Define Requirements** — Present features, scope each category
8. **Create Roadmap** — Spawn lu-roadmapper (continues phase numbering)
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

1. Generate issue body from PROJECT.md (Current Milestone section), REQUIREMENTS.md summary
2. Create issue: \`gh issue create --title "feat({scope}): {milestone-name}" --body "{body}"\`
3. Create branch: \`git checkout -b {issue_number}--{milestone-slug}\`
4. Push branch: \`git push -u origin {branch_name}\`
5. Update state with new issue/branch references:

   \`\`\`bash
   luca-bridge set-field --field=github_issue --value={issue_number} 2>/dev/null || true
   luca-bridge set-field --field=branch --value="{branch_name}" 2>/dev/null || true
   luca-bridge snapshot 2>/dev/null || true
   # Fallback: Update STATE.md directly
   \`\`\`

**If "Continue on existing" selected:**

1. Verify existing issue still open: \`gh issue view {number} --json state\`
2. Add comment to existing issue noting new milestone started
3. Keep existing issue/branch in state (no bridge update needed)

**If "No tracking" selected:**

1. Warn user: commits won't reference issues, PR creation will require manual setup
2. Note: GitHub Issue: None (user opted out) — no bridge update needed

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
- [ ] State machine reflects issue/branch tracking status (via bridge set-field)

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
</main>`,
      order: 1,
    },
  ],
};

export const milestoneNewSkill = createSkill(milestoneNewConfig);
