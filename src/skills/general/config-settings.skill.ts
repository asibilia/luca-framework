/**
 * config-settings Skill - Configure Luca workflow toggles, model profile, and agent settings.
 */
import { BaseSkillImpl } from "../base/base-skill";
import type { SkillConfig } from "../types/skill.types";

// Define the config-settings skill configuration
const configSettingsConfig: SkillConfig = {
  frontmatter: {
    name: "config-settings",
    description: `Configure Luca workflow toggles, model profile, and agent settings.`,
    "disable-model-invocation": true,
  },
  sections: [
    {
      title: "main",
      content: `<main>
# Luca Settings

Configure workflow agents on/off and select model profile via interactive settings.

Updates \`.planning/config.json\` with workflow preferences and model profile selection.

## Process

### 1. Validate Environment

\`\`\`bash
ls .planning/config.json 2>/dev/null
\`\`\`

If not found: Error - run \`/project-new\` first.

### 2. Read Current Config

Parse current values (default to \`true\` if not present):

- \`workflow.research\` — spawn researcher during plan-phase
- \`workflow.plan_check\` — spawn plan checker during plan-phase
- \`workflow.verifier\` — spawn verifier during execute-phase
- \`model_profile\` — which model each agent uses (default: \`balanced\`)

### 3. Present Settings

Use AskQuestion with current values shown:

**Model Profile:**

- Quality: Opus everywhere except verification (highest cost)
- Balanced (Recommended): Opus for planning, Sonnet for execution/verification
- Budget: Sonnet for writing, Haiku for research/verification (lowest cost)

**Research:** Spawn Plan Researcher? (researches domain before planning)

**Plan Check:** Spawn Plan Checker? (verifies plans before execution)

**Verifier:** Spawn Execution Verifier? (verifies phase completion)

### 4. Update Config

Merge new settings into existing config.json:

\`\`\`json
{
  ...existing_config,
  "model_profile": "quality" | "balanced" | "budget",
  "workflow": {
    "research": true/false,
    "plan_check": true/false,
    "verifier": true/false
  }
}
\`\`\`

### 5. Confirm Changes

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Luca ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value |
|----------------------|-------|
| Model Profile        | {quality/balanced/budget} |
| Plan Researcher      | {On/Off} |
| Plan Checker         | {On/Off} |
| Execution Verifier   | {On/Off} |

These settings apply to future /phase-plan and /phase-execute runs.

Quick commands:
- /config-profile <profile> — switch model profile
- /phase-plan --research — force research
- /phase-plan --skip-research — skip research
- /phase-plan --skip-verify — skip plan check
\`\`\`

## Success Criteria

- [ ] Current config read
- [ ] User presented with 4 settings (profile + 3 toggles)
- [ ] Config updated with model_profile and workflow section
- [ ] Changes confirmed to user

## Next Steps

Settings updated. Configuration takes effect immediately.

**Common follow-ups:**
- \`/progress\` — Continue work with new settings
- \`/help\` — Review commands
- \`/config-profile {profile}\` — Quick profile switch
</main>`,
      order: 1,
    },
  ],
};

export class ConfigSettingsSkill extends BaseSkillImpl {
  constructor() {
    super(configSettingsConfig);
  }
}
