# State machine bridge CLI reference: how to read/write state via the typed bridge layer

## rule

# State Machine Bridge

## Overview

Luca uses a typed state machine (`packages/luca-state/`) as the primary source of truth for workflow state. The bridge CLI (`packages/luca-state/src/bridge.ts`) provides a shell-friendly interface that all skills and agents should use, with automatic fallback to STATE.md for backward compatibility.

## Bridge CLI Commands

### Read Commands

| Command | Description | Output |
|---------|-------------|--------|
| \`bun run packages/luca-state/src/bridge.ts read-status\` | Read full state | JSON with phase, plan, status, complexity |
| \`bun run packages/luca-state/src/bridge.ts read-complexity\` | Read complexity level | JSON with complexity field |
| \`bun run packages/luca-state/src/bridge.ts ensure-init\` | Initialize state if not present | Creates state machine + STATE.md |

### Transition Commands

| Command | Description |
|---------|-------------|
| \`bun run packages/luca-state/src/bridge.ts transition set-complexity --complexity=MODERATE\` | Set task complexity |
| \`bun run packages/luca-state/src/bridge.ts transition complete-phase\` | Mark current phase complete |
| \`bun run packages/luca-state/src/bridge.ts transition start-phase --phase=N\` | Start a new phase |
| \`bun run packages/luca-state/src/bridge.ts transition start-plan --plan=N\` | Start a new plan |

## Usage Patterns

### Reading State (Skills/Agents)

Always use the bridge as primary, with STATE.md fallback:

\`\`\`bash
# Primary: Read state from state machine (typed, validated)
STATE_JSON=$(bun run packages/luca-state/src/bridge.ts read-status 2>/dev/null || echo '{"initialized":false}')
# Fallback: Read STATE.md directly (backward compatibility)
STATE_MD=$(cat .planning/STATE.md 2>/dev/null || echo "")
\`\`\`

### Reading Complexity

\`\`\`bash
# Primary: Read complexity from bridge
COMPLEXITY=$(bun run packages/luca-state/src/bridge.ts read-complexity 2>/dev/null | bun -e "const r=JSON.parse(await Bun.stdin.text()); console.log(r.complexity)" 2>/dev/null || echo "MODERATE")
# Fallback: grep STATE.md directly
if [ "$COMPLEXITY" = "" ] || [ "$COMPLEXITY" = "undefined" ]; then
  COMPLEXITY=$(grep "Task Complexity:" .planning/STATE.md | awk '{print $NF}' || echo "MODERATE")
fi
\`\`\`

### Writing State (Transitions)

\`\`\`bash
# Primary: Transition via bridge (updates state machine + STATE.md)
bun run packages/luca-state/src/bridge.ts transition complete-phase 2>/dev/null || true
# STATE.md is also updated directly for backward compatibility
\`\`\`

### Initializing State

\`\`\`bash
# Primary: Initialize via bridge
bun run packages/luca-state/src/bridge.ts ensure-init 2>/dev/null || true
# Fallback: Create STATE.md directly
cat > .planning/STATE.md << 'EOF'
...
EOF
\`\`\`

## Dual-Write Guarantee

The bridge always writes to BOTH the typed state machine AND STATE.md. This means:

- Skills/agents that only read STATE.md will still work
- Skills/agents that read the bridge get typed, validated data
- No data loss during migration
- Backward compatibility preserved

## Migration Status

The bridge is being incrementally adopted across all skills and agents. Each file that reads or writes STATE.md should be updated to use the bridge as primary with STATE.md as fallback.

## Error Handling

All bridge commands use \`2>/dev/null || ...\` to gracefully fall back if:

- The bridge module is not yet built
- The state machine is not initialized
- Any runtime error occurs

This ensures the workflow never breaks due to bridge issues.