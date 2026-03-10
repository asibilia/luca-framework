/**
 * State machine bridge CLI reference: how to read/write state via the typed bridge layer
 */
import { createRule } from "~/rules/__helpers/create-rule";
import type { RuleConfig } from "~/rules/__schemas/rule.schemas";

const stateMachineBridgeConfig: RuleConfig = {
  frontmatter: {
    description:
      "State machine bridge CLI reference: how to read/write state via the typed bridge layer",
    globs: [
      "src/state/**",
      ".planning/**",
      "packages/luca-framework/src/state/**",
    ],
    alwaysApply: false,
  },
  sections: [
    {
      title: "rule",
      content: `# State Machine Bridge

## Overview

Luca uses a typed state machine (\`packages/luca-framework/src/state/\`) as the primary source of truth for workflow state. The bridge CLI (\`luca-bridge\`) provides a shell-friendly interface that all skills and agents should use, with automatic fallback to STATE.md for backward compatibility.

## Bridge CLI Commands

### Read Commands (6)

| Command | Description | Output |
|---------|-------------|--------|
| \\\`read-status\\\` | Read comprehensive workflow status | JSON with state, phase, complexity, oversight |
| \\\`read-complexity\\\` | Read current complexity level | JSON with complexity field |
| \\\`read-oversight\\\` | Read current oversight level | JSON with oversight field |
| \\\`read-phase\\\` | Read current phase info | JSON with phase, milestone, plan IDs |
| \\\`read-field --field=path\\\` | Read an arbitrary context field | JSON with field path and value |
| \\\`read-ledger [--tail=N] [--session=id]\\\` | Read session ledger entries | JSON array of ledger entries |

### Write Commands (2)

| Command | Description |
|---------|-------------|
| \\\`set-field --field=name --value=json\\\` | Set an allowlisted context field and persist |
| \\\`transition --event=TYPE [--data=json]\\\` | Send a workflow event and persist state |

### Lifecycle Commands (5)

| Command | Description |
|---------|-------------|
| \\\`ensure-init [--force]\\\` | Initialize state if not present |
| \\\`snapshot\\\` | Generate STATE.md from current state |
| \\\`gate-check --gate=name\\\` | Check if a named gate is enabled |
| \\\`suspend --phase=N [--reason=str]\\\` | Create checkpoint and suspend phase |
| \\\`resume-phase --phase=N\\\` | Load checkpoint and resume phase |

**Total: 13 subcommands** (6 read + 2 write + 5 lifecycle).

## Usage Patterns

### Reading State (Skills/Agents)

Always use the bridge as primary, with STATE.md fallback:

\\\`\\\`\\\`bash
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_MD=$(cat .planning/STATE.md 2>/dev/null || echo "")
\\\`\\\`\\\`

### Reading Complexity

\\\`\\\`\\\`bash
# Primary: Read complexity from bridge
COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
# Fallback: grep STATE.md directly
if [ "$COMPLEXITY" = "" ] || [ "$COMPLEXITY" = "undefined" ]; then
  COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
fi
\\\`\\\`\\\`

### Writing State (Transitions)

\\\`\\\`\\\`bash
# Primary: Transition via bridge (updates state machine + STATE.md)
luca-bridge transition complete-phase 2>/dev/null || true
# STATE.md is also updated directly for backward compatibility
\\\`\\\`\\\`

### Initializing State

\\\`\\\`\\\`bash
# Primary: Initialize via bridge
luca-bridge ensure-init 2>/dev/null || true
# Fallback: Create STATE.md directly
cat > .planning/STATE.md << 'EOF'
...
EOF
\\\`\\\`\\\`

## Dual-Write Guarantee

The bridge always writes to BOTH the typed state machine AND STATE.md. This means:

- Skills/agents that only read STATE.md will still work
- Skills/agents that read the bridge get typed, validated data
- No data loss during migration
- Backward compatibility preserved

## Migration Status

The bridge is being incrementally adopted across all skills and agents. Each file that reads or writes STATE.md should be updated to use the bridge as primary with STATE.md as fallback.

## Error Handling

All bridge commands use \\\`2>/dev/null || ...\\\` to gracefully fall back if:

- The bridge module is not yet built
- The state machine is not initialized
- Any runtime error occurs

This ensures the workflow never breaks due to bridge issues.`,
      order: 1,
    },
  ],
};

export const stateMachineBridgeRule = createRule(stateMachineBridgeConfig);
