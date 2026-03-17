/**
 * Gate enforcement: orchestrator-resolved flags prevent LLM ad-hoc skip reasoning
 */
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

const gateEnforcementConfig: RuleConfig = {
  frontmatter: {
    description:
      "Gate enforcement: orchestrator-resolved flags prevent LLM ad-hoc skip reasoning",
    globs: ["src/skills/**/*.ts"],
    alwaysApply: true,
  },
  sections: [
    {
      title: "rule",
      content: `# Gate Enforcement

## Core Principle

Gate decisions (premortem, process_data, and any future gated features) MUST be resolved by the **lu orchestrator** and passed as explicit flags to sub-skills. Sub-skills MUST NOT resolve gates themselves.

## Why This Rule Exists

When sub-skills resolve their own gates (e.g., reading config.json or calling luca-bridge gate-check), the LLM executing the skill can rationalize skipping the gate with ad-hoc reasoning ("this phase is simple, premortem is unnecessary"). Orchestrator-resolved flags eliminate this failure mode by making the decision before the sub-skill is even invoked.

## Fail-Closed Semantics

All gate flags use **fail-closed** semantics:

| Flag present | Behavior |
|-------------|----------|
| \`--run-<gate>\` | Gate is enabled — execute the gated feature |
| \`--skip-<gate>\` | Gate is disabled — skip the gated feature |
| No flag at all | **Skip** (fail-closed) — treat as disabled |

This means a sub-skill that receives no gate flag will safely skip the gated feature rather than making its own decision.

## Current Gate Flags

| Gate | Run flag | Skip flag | Orchestrator | Sub-skill |
|------|----------|-----------|-------------|-----------|
| premortem | \`--run-premortem\` | \`--skip-premortem\` | lu.skill.ts | phase-discuss |
| process_data | \`--run-process-data\` | \`--skip-process-data\` | lu.skill.ts | phase-execute |

## Orchestrator Pattern (lu.skill.ts)

The orchestrator resolves gates via \`luca-bridge gate-check\` and passes the result as an explicit flag:

\\\`\\\`\\\`bash
# Orchestrator resolves the gate — sub-skill does NOT decide
GATE_ENABLED=$(luca-bridge gate-check --gate=<gate_name> 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.enabled)" 2>/dev/null || echo "false")
if [ "$GATE_ENABLED" = "true" ]; then
  FLAG="--run-<gate>"
else
  FLAG="--skip-<gate>"
fi
Skill(skill: "<sub-skill>", args: "{phase_number} $FLAG")
\\\`\\\`\\\`

## Sub-Skill Pattern (phase-discuss, phase-execute)

Sub-skills check for the orchestrator-supplied flag. They never call bridge or read config for gate decisions:

\\\`\\\`\\\`bash
# Check for orchestrator-supplied flag (fail-closed: absent flag = skip)
if echo "$ARGS" | grep -q -- "--run-<gate>"; then
  GATE="true"
else
  # --skip-<gate> OR no flag at all = skip (fail-closed)
  GATE="false"
fi
\\\`\\\`\\\`

## Adding New Gates

When adding a new gated feature:

1. **Define the gate** in \`.planning/config.json\` under \`gates\`
2. **Resolve in orchestrator** (lu.skill.ts) using \`luca-bridge gate-check\`
3. **Pass as flag** to the sub-skill (--run-<gate>/--skip-<gate>)
4. **Check flag in sub-skill** using fail-closed pattern
5. **Update this rule** with the new gate entry
6. **Update sub-skill Arguments** line to document the new flags

## Anti-Patterns

### DO NOT: Resolve gates in sub-skills

\\\`\\\`\\\`bash
# WRONG: Sub-skill reads config directly
GATE=$(cat .planning/config.json | grep '"my_gate"' | grep 'true')

# WRONG: Sub-skill calls bridge gate-check
GATE=$(luca-bridge gate-check --gate=my_gate | ...)
\\\`\\\`\\\`

### DO NOT: Use fail-open semantics

\\\`\\\`\\\`bash
# WRONG: No flag = run (fail-open, allows LLM to skip by "forgetting" the flag)
if echo "$ARGS" | grep -q -- "--skip-my-gate"; then
  GATE="false"
else
  GATE="true"  # Dangerous: LLM can omit the flag to force execution
fi
\\\`\\\`\\\`

### DO: Use fail-closed semantics

\\\`\\\`\\\`bash
# CORRECT: No flag = skip (fail-closed)
if echo "$ARGS" | grep -q -- "--run-my-gate"; then
  GATE="true"
else
  GATE="false"
fi
\\\`\\\`\\\``,
      order: 1,
    },
  ],
};

export const gateEnforcementRule = createRule(gateEnforcementConfig);
