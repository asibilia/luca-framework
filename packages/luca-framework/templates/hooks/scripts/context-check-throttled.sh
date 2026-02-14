#!/usr/bin/env bash
# context-check-throttled.sh -- PostToolUse throttled context monitor
#
# Hook event: PostToolUse (async)
# Type: Command hook (asynchronous, does not block tool use)
# Timeout: 10 seconds
#
# Runs the TypeScript context monitor module on a throttled basis.
# Skips execution if the last check was less than 60 seconds ago
# (tracked via a timestamp file in /tmp).
#
# Only outputs a systemMessage when the context zone is "degrading" or "stop".
# Silent when context usage is healthy (peak or good zones).
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# --- Throttle check ---
THROTTLE_FILE="/tmp/.luca-context-check-ts"
THROTTLE_SECONDS=60

if [ -f "$THROTTLE_FILE" ]; then
  LAST_CHECK=$(cat "$THROTTLE_FILE" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$((NOW - LAST_CHECK))
  if [ "$ELAPSED" -lt "$THROTTLE_SECONDS" ]; then
    exit 0  # Skip — too recent
  fi
fi

# Update timestamp
date +%s > "$THROTTLE_FILE"

# --- Run context monitor ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Run the TypeScript context monitor and capture output
# Suppress stderr to avoid noise from missing files
RESULT=$(bun run src/memory/context-monitor.ts --project-dir="$PROJECT_DIR" 2>/dev/null) || exit 0

# Extract zone from JSON output
ZONE=$(printf '%s' "$RESULT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  process.stdout.write(data.zone || 'unknown');
" 2>/dev/null) || exit 0

# Only output warning for degrading or stop zones
if [ "$ZONE" = "degrading" ] || [ "$ZONE" = "stop" ]; then
  USAGE=$(printf '%s' "$RESULT" | bun -e "
    const data = JSON.parse(await Bun.stdin.text());
    process.stdout.write(String(Math.round(data.usage_percent)));
  " 2>/dev/null) || USAGE="unknown"

  printf '{"systemMessage": "Context usage at %s%% (zone: %s). Consider compressing memory or starting a new session."}' "$USAGE" "$ZONE"
fi

exit 0
