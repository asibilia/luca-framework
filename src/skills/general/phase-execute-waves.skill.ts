/**
 * phase-execute-waves Sub-Skill — Discover, group, and execute phase plans by wave.
 *
 * Extracts Steps 1-4 from the monolithic phase-execute skill (wave execution loop).
 *
 * **Responsibility:** Validate the phase directory and plan files, discover all
 * PLAN.md files, group plans by wave number from frontmatter, and execute waves
 * sequentially (plans within a wave execute in dependency order). Write results
 * to the shared context file.
 *
 * **Input:** Phase number, flags (from orchestrator args)
 * **Output:** Populated `phase_execute_waves` section in `/tmp/phase-execute-context.json`
 *
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 3
 */
import { createSkill } from "~/skills/__helpers/create-skill";

import type { SkillConfig } from "~/skills/__schemas/skill.schemas";

const phaseExecuteWavesConfig: SkillConfig = {
  frontmatter: {
    name: "phase-execute-waves",
    description:
      "Discover, group, and execute phase plans by wave for the phase-execute sub-skill chain.",
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# phase-execute-waves — Wave Discovery, Grouping, and Execution

Discover all plans in a phase, group them by wave, and execute each wave sequentially. Plans within a wave execute in dependency order.

## Context File Protocol

This sub-skill is part of the phase-execute chain. It reads/writes the shared context file at \`/tmp/phase-execute-context.json\`.

**Read:** Call \`readPhaseExecuteContext()\` from \`src/skills/__schemas/phase-execute-context.schemas.ts\`. If \`success: false\`, ABORT immediately — do not proceed with stale or missing context.

**Write:** Call \`writePhaseExecuteContext({ phase_execute_waves: { ... } })\` to populate the \`phase_execute_waves\` section.

## Vault Resolution

\`\`\`bash
REPO_VAULT=$(cat .planning/config.json 2>/dev/null | grep -o '"vault"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -o '"[^"]*"$' | tr -d '"')
if [ -z "$REPO_VAULT" ]; then
  REPO_VAULT=\${LUCA_MUNINN_VAULT:-default}
fi
DEFAULT_VAULT="default"
\`\`\`

## Process

### Step 1: Validate Phase Directory

Find the phase directory and validate it contains plan files:

\`\`\`bash
PHASE_DIR=$(ls -d .planning/phases/{phase_number}-* 2>/dev/null | head -1)
\`\`\`

If no phase directory found, ABORT with message suggesting the phase number may be incorrect.

### Step 2: Discover Plan Files

Find all PLAN.md files in the phase directory:

\`\`\`bash
PLANS=$(ls \${PHASE_DIR}/*-PLAN.md 2>/dev/null)
\`\`\`

If no plans found, check for a single \`PLAN.md\` (shorthand for single-wave phases). If still none, ABORT — nothing to execute.

For each plan file, parse the YAML frontmatter to extract:
- \`wave\` number (default: 1)
- \`depends_on\` array (default: [])
- \`autonomous\` flag (default: true)
- \`type\` (feature, bugfix, etc.)

### Step 3: Group Plans by Wave

Group discovered plans by wave number. Plans with the same wave number form a wave. Waves execute sequentially (wave 1, then wave 2, etc.). Within a wave, plans execute in dependency order.

If \`--gaps-only\` flag is set, filter to only plans that have incomplete tasks or failed verification from previous runs.

### Step 4: Execute Waves Sequentially

For each wave (in order):

1. Determine execution order within the wave based on \`depends_on\`
2. For each plan in the wave:
   - Spawn \`lu-executor\` sub-agent via Task() with the plan content and context
   - Wait for completion
   - Collect execution summary (commit hashes, deviations, task count)
3. After all plans in the wave complete, check for failures:
   - If any plan failed and it blocks downstream plans, evaluate whether to continue or ABORT
   - If non-blocking failure, log and continue

**Sub-agent spawning pattern:**

\`\`\`
Task(
  prompt: """
<execution_context>
**Plan:** {plan_path}
**Phase:** {phase_number}
**Wave:** {wave_number}
{additional_context}
</execution_context>

Execute this plan. Read the plan file, implement each task, commit atomically, and create a SUMMARY.md.
""",
  subagent_type: "lu-executor",
  description: "Execute plan {plan_name} (wave {wave_number})"
)
\`\`\`

**Parallel execution within waves:** If multiple plans in the same wave have no mutual dependencies, they can be spawned in parallel. However, if \`depends_on\` relationships exist within the wave, respect those ordering constraints.

### Step 5: Write to Context File

\`\`\`typescript
import { writePhaseExecuteContext } from "src/skills/__schemas/phase-execute-context.schemas";

await writePhaseExecuteContext({
  phase_execute_waves: {
    plans_discovered: totalPlans,
    waves_grouped: totalWaves,
    waves_executed: wavesCompleted,
    execution_summaries: waveSummaries,
  },
});
\`\`\`

## Output

On success, the context file will contain:

\`\`\`json
{
  "context_version": 1,
  "phase_execute_waves": {
    "plans_discovered": 3,
    "waves_grouped": 2,
    "waves_executed": 2,
    "execution_summaries": [
      { "wave_number": 1, "plan_count": 2, "status": "completed" },
      { "wave_number": 2, "plan_count": 1, "status": "completed" }
    ]
  }
}
\`\`\`

## Error Handling

- **Phase directory not found:** ABORT with message indicating the phase number may be wrong.
- **No plan files found:** ABORT with message indicating the phase has no plans to execute.
- **Plan frontmatter parse failure:** Log warning for that plan and skip it. Do not ABORT the entire wave.
- **lu-executor failure:** Log the failure, mark the plan as failed in the summary, and evaluate whether downstream plans can still execute.
- **Context file read failure:** ABORT immediately per PREMORTEM Constraint #1.

## Constraints

- Write results to context file via \`writePhaseExecuteContext()\`
- Spawn lu-executor for each plan — do NOT execute plans inline
- Respect wave ordering: complete wave N before starting wave N+1
- Respect dependency ordering within waves
- Use REPO_VAULT for project-scoped MuninnDB operations
</main>`,
      order: 1,
    },
  ],
};

export const phaseExecuteWavesSkill = createSkill(phaseExecuteWavesConfig);
