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

Luca uses a typed state machine (\`packages/luca-framework/src/state/\`) as the primary source of truth for workflow state. The bridge CLI (\`luca-bridge\`) provides a shell-friendly interface that all skills and agents should use, as the sole interface for reading and writing workflow state.

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
| \\\`gate-check --gate=name\\\` | Check if a named gate is enabled |
| \\\`suspend --phase=N [--reason=str]\\\` | Create checkpoint and suspend phase |
| \\\`resume-phase --phase=N\\\` | Load checkpoint and resume phase |

**Total: 13 subcommands** (6 read + 2 write + 5 lifecycle).

## Usage Patterns

### Reading State (Skills/Agents)

Always use the bridge for state reads:

\\\`\\\`\\\`bash
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(luca-bridge read-status 2>/dev/null || echo '{"initialized":false}')
\\\`\\\`\\\`

### Reading Complexity

\\\`\\\`\\\`bash
# Primary: Read complexity from bridge
COMPLEXITY=$(luca-bridge read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")

\\\`\\\`\\\`

### Writing State (Transitions)

\\\`\\\`\\\`bash
# Transition via bridge (updates state.json)
# NOTE: Replace <PHASE_ID> with the current phase number before running
luca-bridge transition --event=PHASE_COMPLETE --data='{"phase_id":<PHASE_ID>,"summary":"Phase completed"}' 2>/dev/null || true
\\\`\\\`\\\`

### Initializing State

\\\`\\\`\\\`bash
# Primary: Initialize via bridge
luca-bridge ensure-init 2>/dev/null || true
\\\`\\\`\\\`

## Dual-Write Guarantee

The bridge writes to state.json as the sole source of truth. All skills and agents read state via bridge commands.

## Migration Status

All skills and agents use bridge commands for state access. state.json is the sole state file.

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
