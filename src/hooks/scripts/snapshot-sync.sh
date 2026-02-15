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

# Check if state machine bridge exists
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
BRIDGE="$PROJECT_DIR/src/state-machine/bridge.ts"

if [ ! -f "$BRIDGE" ]; then
  exit 0  # Bridge not available -- skip silently
fi

# Check if state.json exists
STATE_JSON="$PROJECT_DIR/.planning/state.json"
if [ ! -f "$STATE_JSON" ]; then
  exit 0  # State machine not initialized -- skip silently
fi

# Update throttle timestamp
date +%s > "$THROTTLE_FILE"

# Regenerate STATE.md snapshot from state machine
cd "$PROJECT_DIR"
bun run "$BRIDGE" snapshot 2>/dev/null || true

exit 0
