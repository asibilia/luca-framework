/**
 * milestone-complete Skill — Flat Agent() orchestrator for milestone completion.
 *
 * Delegates work to 5 Agent() sub-agents (leaf workers):
 *   milestone-learn, milestone-prune, milestone-shadow,
 *   milestone-archive, milestone-finalize
 *
 * Sub-agents that previously spawned Task() (milestone-learn via lu-learner,
 * milestone-shadow-gate via lu-shadow-scanner) now do their work directly
 * as leaf agents without sub-agent spawning.
 *
 * @see docs/skill-to-agent-migration/architecture.md
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const milestoneCompleteConfig: SkillConfig = {
  frontmatter: {
    name: "milestone-complete",
    description:
      "Archive a completed milestone by orchestrating Agent() sub-agents: milestone-learn, milestone-prune, milestone-shadow, milestone-archive, milestone-finalize.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# milestone-complete — Flat Agent() Orchestrator

Archive a completed milestone through coordinated Agent() sub-agents. Each agent is a leaf worker that does its work directly (no sub-agent spawning).

## Constraints

- **ALL Agent() calls originate from this orchestrator**
- **Sub-agents CANNOT call Agent(), Task(), or Skill()**
- **Prompt templates** in \`src/skills/__helpers/agent-prompts.ts\`

## Arguments

\`<version>\` (e.g., "8.5.0", "9.0")

## State Machine

\`\`\`
idle -> learned -> pruned -> scanned -> archived -> finalized
\`\`\`

Terminal: \`finalized\` (success) or \`failed\` (error).
Conditional: \`SKIP_SCAN\` when shadow_debt.enabled == false.

**Write \`current_state\` after EVERY transition:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write milestone-complete '{"current_state":"learned"}'
\`\`\`

## Process

### Step 0: Parse Args, Crash Recovery, Initialize Context

Parse milestone version. Read shadow debt config.

**Crash recovery:**
\`\`\`bash
EXISTING_STATE=$(bun src/skills/__schemas/context-cli.ts state milestone-complete 2>/dev/null || echo "")
if [ -n "$EXISTING_STATE" ] && [ "$EXISTING_STATE" != "idle" ]; then
  echo "Resuming from state: $EXISTING_STATE"
else
  bun src/skills/__schemas/context-cli.ts init milestone-complete
fi
\`\`\`

\`\`\`bash
SHADOW_ENABLED=$(cat .planning/config.json | bun -e "const c=JSON.parse(await Bun.stdin.text()); console.log(c.shadow_debt?.enabled ?? true)" 2>/dev/null || echo "true")
\`\`\`

### Step 1: Learning Extraction (idle -> learned)

Read \`src/skills/__helpers/agent-prompts.ts\` for the MILESTONE_LEARN_PROMPT template, then:

\`\`\`
Agent(name: "milestone-learn", description: "Extract milestone learnings",
  prompt: MILESTONE_LEARN_PROMPT with vault=REPO_VAULT)
\`\`\`

The learn agent consolidates session learnings, promotes validated patterns, and establishes decisions. It does ALL learning work as a leaf agent (no spawning Task(lu-learner)).

On failure: write state "failed", HALT.

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write milestone-complete '{"current_state":"learned"}'
\`\`\`

### Step 2: Stale Memory Pruning (learned -> pruned)

\`\`\`
Agent(name: "milestone-prune", description: "Prune stale memories",
  prompt: MILESTONE_PRUNE_PROMPT with vault=REPO_VAULT)
\`\`\`

The prune agent identifies stale engrams and runs consolidation. It returns the list of stale candidates for the orchestrator to present to the user for review (pruning decisions are interactive — the orchestrator handles user input inline after the agent returns).

On failure: write state "failed", HALT.

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write milestone-complete '{"current_state":"pruned"}'
\`\`\`

### Step 3: Shadow Debt Gate (pruned -> scanned) — Conditional

**If SHADOW_ENABLED == "true":**

\`\`\`
Agent(name: "milestone-shadow", description: "Scan for shadow debt",
  prompt: MILESTONE_SHADOW_PROMPT with vault=REPO_VAULT)
\`\`\`

The shadow agent scans the repo for orphaned files, misplaced artifacts, and tech debt. It does ALL scanning as a leaf agent (no spawning Task(lu-shadow-scanner)).

On failure (optional): log warning, continue.

**If SHADOW_ENABLED == "false":** Skip (SKIP_SCAN).

**Write state (both cases):**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write milestone-complete '{"current_state":"scanned"}'
\`\`\`

### Step 4: Archive Milestone (scanned -> archived)

\`\`\`
Agent(name: "milestone-archive", description: "Archive milestone artifacts",
  prompt: MILESTONE_ARCHIVE_PROMPT with vault=REPO_VAULT)
\`\`\`

The archive agent gathers stats, archives roadmap/requirements, updates PROJECT.md, clears session context, resets state machine, and creates GitHub milestone.

On failure: write state "failed", HALT.

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write milestone-complete '{"current_state":"archived"}'
\`\`\`

### Step 5: Finalize (archived -> finalized)

\`\`\`
Agent(name: "milestone-finalize", description: "Create commit and tag",
  prompt: MILESTONE_FINALIZE_PROMPT with vault=REPO_VAULT)
\`\`\`

The finalize agent creates the final commit, git tag, and reports the tag name. The orchestrator handles the push decision (ask user inline).

On failure: write state "failed", HALT.

**Write state:**
\`\`\`bash
bun src/skills/__schemas/context-cli.ts write milestone-complete '{"current_state":"finalized"}'
\`\`\`

### Step 6: Gap Detection Audit

Verify execution coverage:
- \`milestone_learn\`: required
- \`milestone_prune\`: required
- \`milestone_shadow\`: optional (may be skipped)
- \`milestone_archive\`: required
- \`milestone_finalize\`: required

If any required step missing: log warning (advisory).

## Error Handling

**Required agents** (learn, prune, archive, finalize): failure -> state "failed", halt.
**Optional agents** (shadow): failure -> log warning, continue.

## Success Criteria

- [ ] Learnings extracted (milestone-learn agent)
- [ ] Stale memories pruned (milestone-prune agent)
- [ ] Shadow debt scanned OR skipped
- [ ] Milestone archived with stats (milestone-archive agent)
- [ ] Git tagged and committed (milestone-finalize agent)
- [ ] current_state written after every transition
- [ ] Gap detection audit passes

**Next:** \`/milestone-new\` — Start the next milestone cycle
</main>`,
      order: 1,
    },
  ],
};

export const milestoneCompleteSkill = createSkill(milestoneCompleteConfig);
