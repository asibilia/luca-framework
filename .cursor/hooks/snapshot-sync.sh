#!/usr/bin/env bash
# snapshot-sync.sh -- Sync STATE.md from state machine (throttled)
#
# Hook event: PostToolUse (async)
# Timeout: 10 seconds
#
# Regenerates .planning/STATE.md from .planning/state.json
# on a throttled basis (skip if last sync was within 120 seconds).
# This ensures STATE.md backward compatibility while the state
# machine is the source of truth.

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Cascading bridge lookup: installed bin → monorepo source → skip
run_bridge() {
  if command -v luca-bridge &>/dev/null; then
    luca-bridge "$@"
  elif [ -f "${CLAUDE_PROJECT_DIR:-.}/packages/luca-framework/src/state/bridge.ts" ]; then
    bun run "${CLAUDE_PROJECT_DIR:-.}/packages/luca-framework/src/state/bridge.ts" "$@"
  fi
}

# Read stdin JSON (standard hook pattern)
INPUT=$(cat)

# Throttle: skip if last sync was recent
THROTTLE_FILE="/tmp/.luca-snapshot-sync-ts"
THROTTLE_SECONDS=120

if [ -f "$THROTTLE_FILE" ]; then
  LAST_SYNC=$(cat "$THROTTLE_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_SYNC))
  if [ "$ELAPSED" -lt "$THROTTLE_SECONDS" ]; then
    exit 0  # Skip -- too recent
  fi
fi

# Check if state.json exists
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
STATE_JSON="$PROJECT_DIR/.planning/state.json"
if [ ! -f "$STATE_JSON" ]; then
  exit 0  # State machine not initialized -- skip silently
fi

# Update throttle timestamp
date +%s > "$THROTTLE_FILE"

# Regenerate STATE.md snapshot from state machine
cd "$PROJECT_DIR"
run_bridge snapshot 2>/dev/null || true

exit 0
