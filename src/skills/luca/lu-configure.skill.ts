/**
 * lu-configure Sub-Skill — Read config, apply overrides, run pre-flight validation.
 *
 * Extracts the configuration section from the monolithic lu skill.
 *
 * **Responsibility:** Read .planning/config.json, apply command-line overrides,
 * run pre-flight validation (check STATE.md, verify branch, check phase directory),
 * display session start banner, and write results to the shared context file.
 *
 * **Input:** None (reads from context file for flag state)
 * **Output:** Populated `lu_configure` section in `/tmp/lu-context.json`
 *
 * This skill spawns lu-cognition for autonomous pipeline cognitive pre-flight.
 *
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 4
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const luConfigureConfig: SkillConfig = {
  frontmatter: {
    name: "lu-configure",
    description:
      "Read config, apply CLI overrides, run pre-flight validation, and initialize the lu session.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# lu-configure — Configuration & Pre-Flight

Read project configuration, apply CLI overrides, run pre-flight validation, and initialize the session. Write results to the shared context file.

## Context File Protocol

This sub-skill is part of the lu chain. It reads/writes the shared context file at \`/tmp/lu-context.json\`.

**Read:** Call \`readLuContext()\` from \`src/skills/__schemas/lu-context.schemas.ts\`. If \`success: false\`, ABORT immediately.

**Write:** Call \`writeLuContext({ lu_configure: { ... } })\` to populate the \`lu_configure\` section.

## Process

### Step 0a: Read Config

\`\`\`bash
CONFIG=$(cat .planning/config.json 2>/dev/null || echo '{}')
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE=$(cat .planning/STATE.md 2>/dev/null || echo "")
ROADMAP=$(cat .planning/ROADMAP.md 2>/dev/null || echo "")
\`\`\`

Extract settings (with defaults). Config key is 'lu' with one-version fallback to 'autopilot':

\`\`\`bash
OVERSIGHT=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.oversight ?? 'milestone');
")
MAX_PHASES=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.max_phases_per_session ?? 10);
")
AUTO_PLAN=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.auto_plan_phases ?? true);
")
SKIP_UAT=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const lu = c.lu ?? c.autopilot;
  console.log(lu?.skip_uat ?? lu?.skip_uat_in_autopilot ?? true);
")
GAP_RETRIES=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.gap_closure_retries ?? 1);
")
CROSS_MILESTONE=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.cross_milestone ?? false);
")
BACKLOG_SCAN=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.backlog_scan ?? true);
")
SWARM_ENABLED=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.swarm_enabled ?? true);
")
MAX_PARALLEL=$(echo "$CONFIG" | bun -e "
  const c = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log((c.lu ?? c.autopilot)?.max_parallel_phases ?? 3);
")
\`\`\`

### Step 0b: Apply CLI Flag Overrides

- If \`--oversight=<level>\` passed: override OVERSIGHT
- If \`--ask\` passed: set OVERSIGHT to "phase"
- If \`--max-phases=N\` passed: override MAX_PHASES
- If \`--skip-backlog\` passed: set BACKLOG_SCAN=false
- If \`--no-swarm\` passed: set SWARM_ENABLED=false (force serial execution)
- If \`--dry-run\` passed: set DRY_RUN=true (display plan, don't execute)

### Step 0c: Cognitive Pre-Flight (Autonomous Pipeline)

Unless the session already has cognitive context loaded:

\`\`\`
Task(
  agent: "lu-cognition",
  prompt: "**Recipient:** lu orchestrator (report findings back to this orchestrator)\\n\\nRun cognitive pre-flight for lu session. Load project identity via mcp__muninn__muninn_recall_tree(vault: REPO_VAULT, id: 'brain:project-identity'). Recall relevant patterns via mcp__muninn__muninn_recall(vault: REPO_VAULT, context: 'relevant patterns and decisions for planning and workflow'). Clear previous session context via mcp__muninn__muninn_forget(vault: REPO_VAULT, id: 'session:*')."
)
\`\`\`

### Step 0d: Display Session Start & Initialize State Machine

Transition state machine:

\`\`\`bash
luca-bridge transition --event=START 2>/dev/null || true
\`\`\`

Display session banner with resolved settings:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca > SESSION START
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Oversight:     {OVERSIGHT}
Max phases:    {MAX_PHASES}
Auto-plan:     {AUTO_PLAN}
Backlog scan:  {BACKLOG_SCAN}
Cross-milestone: {CROSS_MILESTONE}
Swarm:         {SWARM_ENABLED} (max {MAX_PARALLEL} parallel)
\`\`\`

After cognitive pre-flight completes:

\`\`\`bash
luca-bridge transition --event=PREFLIGHT_COMPLETE 2>/dev/null || true
\`\`\`

### Step 0e: Write Results to Context File

\`\`\`typescript
writeLuContext({
  lu_configure: {
    config_loaded: true,
    overrides_applied: true,
    pre_flight_complete: true,
  },
});
\`\`\`

## Completion

After writing results, return to the lu orchestrator. The orchestrator will write \`current_state: "configured"\` and either invoke lu-backlog or send SKIP_BACKLOG.
</main>`,
      order: 1,
    },
  ],
};

export const luConfigureSkill = createSkill(luConfigureConfig);
