#!/usr/bin/env bash
# context-monitor.sh — Warn when context usage appears high
#
# Hook event: Stop
# Type: Command hook (synchronous)
# Timeout: 5 seconds
#
# Checks the session transcript file size as a proxy for context usage.
# Outputs a systemMessage warning when thresholds are exceeded.
#
# Thresholds (bytes, configurable via environment or defaults):
#   CONTEXT_WARN=100000      (~100KB, ~30% context)
#   CONTEXT_ALERT=200000     (~200KB, ~50% context)
#   CONTEXT_CRITICAL=300000  (~300KB, ~70% context)
#
# These are rough approximations. Actual context usage depends on
# tokenization, compaction state, and model context window size.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

# Check stop_hook_active (Claude) or loop_count (Cursor) to prevent infinite loops
# If this Stop was triggered by a previous Stop hook, exit immediately
IS_ACTIVE=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const active = data.stop_hook_active || (data.loop_count > 0) || false;
  process.stdout.write(String(active));
")

if [ "$IS_ACTIVE" = "true" ]; then
  exit 0
fi

# Extract transcript path
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  const tp = data.transcript_path;
  if (tp) process.stdout.write(tp);
")

# Exit if no transcript path
if [ -z "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Exit if transcript file doesn't exist
if [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Get file size in bytes
FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')

# Configurable thresholds (can be overridden via environment)
WARN_THRESHOLD="${CONTEXT_WARN:-100000}"
ALERT_THRESHOLD="${CONTEXT_ALERT:-200000}"
CRITICAL_THRESHOLD="${CONTEXT_CRITICAL:-300000}"

# Determine warning level
if [ "$FILE_SIZE" -ge "$CRITICAL_THRESHOLD" ]; then
  # Critical — strongly suggest compaction
  LEVEL="CRITICAL"
  MESSAGE="Context usage is very high (~${FILE_SIZE} bytes transcript). Quality may be degrading. Consider running /compact to free context space, or start a new session."
elif [ "$FILE_SIZE" -ge "$ALERT_THRESHOLD" ]; then
  # Alert — recommend compaction
  LEVEL="HIGH"
  MESSAGE="Context usage is high (~${FILE_SIZE} bytes transcript). Consider running /compact soon to maintain response quality."
elif [ "$FILE_SIZE" -ge "$WARN_THRESHOLD" ]; then
  # Warn — informational
  LEVEL="MODERATE"
  MESSAGE="Context usage is moderate (~${FILE_SIZE} bytes transcript). No action needed yet, but be mindful of context limits."
else
  # Below threshold — no warning
  exit 0
fi

# Output warning message
# Claude Code: systemMessage, Cursor: followup_message
# Pass variables via env to avoid shell interpolation in JS strings
HOOK_LEVEL="$LEVEL" HOOK_MSG="$MESSAGE" bun -e "
  const level = process.env.HOOK_LEVEL;
  const message = process.env.HOOK_MSG;
  const text = '[Context Monitor: ' + level + '] ' + message;
  const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
  const msg = isClaude ? { systemMessage: text } : { followup_message: text };
  process.stdout.write(JSON.stringify(msg));
"

exit 0
