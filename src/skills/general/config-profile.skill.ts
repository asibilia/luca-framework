/**
 * config-profile Skill - Switch the model profile (quality/balanced/budget) for Luca agent delegation.
 */
import { createSkill } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the config-profile skill configuration
const configProfileConfig: SkillConfig = {
  frontmatter: {
    name: "config-profile",
    description: `Switch the model profile (quality/balanced/budget) for Luca agent delegation.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Set Profile

Quick switch model profile for Luca agents.

**Arguments:** \`<profile>\` (quality | balanced | budget)

## Profiles

| Profile | Description |
|---------|-------------|
| **quality** | Opus everywhere except verification — higher cost, deeper analysis |
| **balanced** | Opus for planning, Sonnet for execution — good balance (default) |
| **budget** | Sonnet for writing, Haiku for research/verification — lowest cost |

## Model Mapping

| Agent | quality | balanced | budget |
|-------|---------|----------|--------|
| lu-planner | opus | opus | sonnet |
| lu-roadmapper | opus | sonnet | sonnet |
| lu-executor | opus | sonnet | sonnet |
| lu-phase-researcher | opus | sonnet | haiku |
| lu-project-researcher | opus | sonnet | haiku |
| lu-research-synthesizer | sonnet | sonnet | haiku |
| lu-verifier | sonnet | sonnet | haiku |
| lu-plan-checker | sonnet | sonnet | haiku |

## Process

1. **Validate profile:**
   - Must be one of: quality, balanced, budget
   - Error with usage if invalid

2. **Update config:**

   \`\`\`bash
   # Update model_profile in config.json
   \`\`\`

3. **Confirm:**

   \`\`\`
   ✓ Model profile set to: {profile}
   
   Applies to:
   - /phase-plan
   - /phase-execute
   - /debug
   - All agent spawning commands
   \`\`\`

## Success Criteria

- [ ] Profile validated
- [ ] config.json updated
- [ ] User knows what changed

## Next Steps

Profile updated to \`{profile}\`. Takes effect on next agent invocation.

**Common follow-ups:**
- \`/progress\` — Continue your work
- \`/config-settings\` — Adjust other settings
</main>`,
      order: 1,
    },
  ],
};

export const configProfileSkill = createSkill(configProfileConfig);
