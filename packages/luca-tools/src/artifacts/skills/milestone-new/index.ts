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

**Arguments:** \`[milestone name, e.g., 'v1.1 Notifications']\` \`[version]\` \`[--skip-research]\`

## Creates/Updates

- MuninnDB \`brain:project-identity\` — updated with new milestone marker + goals
- MuninnDB \`brain:project-requirements\` — scoped requirements for this milestone (REQ-IDs continue from prior milestone)
- MuninnDB \`research:milestone-<slug>:*\` — domain research (optional, focuses on NEW features)
- \`.luca/roadmap.md\` — phase structure, written via \`luca roadmap create\` (full replace) or \`luca roadmap add-phase\` (incremental). **Never hand-edited**: \`roadmap.md\` is generated output, and a direct write is a contract violation the stage gate blocks.
- \`.luca/state.json\` — reset for new milestone via \`luca workflow reset --confirm\`

**After this command:** Run \`/phase-plan [N]\` to start execution.

## Resolving \`<repo_vault>\`

Every MuninnDB call below is scoped to the repo vault. Resolve it from \`.luca/config.json\` → \`muninn.vault\`, falling back to \`"default"\`. Do not guess the name.

## Process

1. **Load Context** — Read project identity from MuninnDB, prior milestone snapshots under \`.luca/milestones/\`, and the current workflow state:

   \`\`\`bash
   luca brain recall-root --concept brain:project-identity
   STATE_JSON=$(luca state read 2>/dev/null || echo '{"initialized":false}')
   \`\`\`

   Follow the \`muninn_recall_tree\` procedure \`luca brain recall-root\` emits. **Do NOT \`muninn_recall\` the \`"brain:project-identity"\` slug** — recall matches content embeddings, not the concept string, so a slug query returns nothing. The CLI resolves the cached root ULID instead, which is the only thing \`recall_tree\` accepts as a root.

   Recall prior milestones with \`mcp__muninn__muninn_recall({ vault: "<repo_vault>", context: ["milestone:"], mode: "recent" })\`.

   If the pipeline is mid-flight (\`pipelineStep\` is anything but \`idle\` — a finished run resets to \`idle\`), warn the user that starting a new milestone resets pipeline state, and confirm before proceeding.

2. **Gather Milestone Goals** — Recall any per-milestone discussion context from MuninnDB (\`milestone:<slug>\`), or question the user: what should this milestone accomplish, key features, constraints/deadlines, target scope.
3. **Determine Milestone Version** — Parse last version from \`.luca/milestones/\` snapshots and the Step 1 recall, suggest the next sequential version (\`v1\` if there are none), or use a version passed in arguments. Confirm with the user.
4. **Persist the milestone in MuninnDB** — the \`milestone:*\` prefix routes to the **repo** vault per the vault-routing rule:

   \`\`\`
   mcp__muninn__muninn_remember(vault: "<repo_vault>", concept: "milestone:v{version}-goals", content: "<structured goal list + scope + constraints>", tags: ["milestone","active"])
   \`\`\`

   **There is no \`.luca/PROJECT.md\`.** Project identity lives in the MuninnDB brain tree and milestone goals live in the memory above. Do not create root-level planning files — the \`.luca/\` contract does not allow them and the stage gate rejects them.

5. **Reset workflow state for new milestone:**

   \`\`\`bash
   luca workflow reset --confirm
   # The freshly reset state defaults to pipelineStep=triage. The milestone identifier is captured via MuninnDB (above), not as a state field.
   \`\`\`

   \`--confirm\` is REQUIRED — the handler refuses a reset without it, since this is the one destructive command in the write surface. Do not append \`2>/dev/null || true\`: that swallows the refusal and leaves the workflow un-reset while reading as success.

6. **Research Decision** — unless \`--skip-research\` was passed, spawn the \`researcher\` subagent per major feature area with milestone-aware context (project brief + goal list + the feature). Store each summary in MuninnDB under \`research:<feature-slug>\` in the repo vault; milestone-level research is memory-only — per-phase \`research.md\` files are written later by the pipeline once phases exist. Present key findings.
7. **Define Requirements** — Present the feature list scoped as **Must have** / **Should have** / **Nice to have**, let the user adjust, then fold the agreed list into the Step 4 milestone memory (re-\`remember\` with requirements appended). \`brain:project-requirements\` REQ-IDs continue from the prior milestone — never restart the numbering.
8. **Create Roadmap** — organize requirements into ordered phases by dependency and priority, stage them as JSON, then run \`luca roadmap create --file\`:

   \`\`\`bash
   # .luca/tmp/roadmap.json:
   # [
   #   { "name": "<phase name>", "deps": [...], "complexity": "<TRIVIAL|SIMPLE|MODERATE|COMPLEX|CRITICAL>" },
   #   ...
   # ]
   luca roadmap create --file .luca/tmp/roadmap.json
   \`\`\`

   \`roadmap create\` is a FULL REPLACE and is legal **only in \`idle\`/\`triage\`**; it resets \`currentPhase\` to 0 and sets \`totalPhases\`. Step 5's reset is what puts you in a legal step — if you skipped it, this call is refused. To EXTEND an existing roadmap instead of replacing it, use \`luca roadmap add-phase\` (phase-agnostic, append/insert only).

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

## Step 10 — Done

Report completion:

\`\`\`
## Milestone v<version>: <name> — Initialized

Roadmap: <N> phases. Pipeline reset to idle.
Next: /lu <describe the first phase of work>
\`\`\`

Then record the initialization and **promote it to the verified tier** — this is a user-confirmed milestone, not an inference:

\`\`\`
mcp__muninn__muninn_remember({
  vault: "<repo_vault>",
  concept: "milestone:v<version>-initialized",
  content: "Milestone v<version> '<name>' initialized: <N> requirements across <N> phases. Goals: <brief>."
})
\`\`\`

Capture the returned id and call \`mcp__muninn__muninn_trust({ id: <id>, trust: "verified", vault: "<repo_vault>" })\`.

## Success Criteria

- [ ] MuninnDB \`brain:project-identity\` updated with current-milestone marker
- [ ] \`.luca/state.json\` reset for new milestone (via \`luca workflow reset --confirm\`, refusal NOT swallowed)
- [ ] Prior milestone-context engrams consumed (recalled into the new milestone's planning)
- [ ] Research completed (if selected) — 4 parallel agents spawned, milestone-aware
- [ ] Requirements gathered (from research or conversation)
- [ ] User scoped each category
- [ ] MuninnDB \`brain:project-requirements\` updated with new milestone's REQ-IDs
- [ ] \`.luca/roadmap.md\` created via \`luca roadmap create\` / \`luca roadmap add-phase\` (never hand-edited) with phases continuing from previous milestone
- [ ] Initialization memory stored and promoted with \`muninn_trust\` to \`verified\`
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
    name: 'milestone-new',
    description:
        'Start a new milestone cycle with requirements gathering and roadmap generation.',
    body: BODY,
})
