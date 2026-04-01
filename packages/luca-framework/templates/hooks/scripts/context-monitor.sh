#!/usr/bin/env bash
# context-monitor.sh -- Warn when context usage appears high
#
# Hook event: Stop
# Type: Command hook (synchronous)
# Timeout: 5 seconds
#
# Checks context usage via transcript file size (primary signal):
#    CONTEXT_WARN=100000      (~100KB, ~30% context)
#    CONTEXT_ALERT=200000     (~200KB, ~50% context)
#    CONTEXT_CRITICAL=300000  (~300KB, ~70% context)
#
# Note: WORKING.md, BRAIN.md, and MEMORY.md file size checks have been
# removed. Session context is now tracked in MuninnDB (muninn_remember /
# muninn_recall) rather than in local .planning/ files.
#
# Outputs a systemMessage warning when thresholds are exceeded.
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

# ─── SEC-01: Validate transcript path ──────────────────────────────────
# Reject relative paths and paths outside $HOME to prevent
# information leakage (file size) from arbitrary filesystem locations.
if [ -n "$TRANSCRIPT_PATH" ]; then
  # Must be an absolute path
  case "$TRANSCRIPT_PATH" in
    /*) ;; # absolute path — OK
    *)
      TRANSCRIPT_PATH=""  # reject relative paths
      ;;
  esac
fi

if [ -n "$TRANSCRIPT_PATH" ]; then
  # Resolve symlinks and verify path is within home directory
  RESOLVED_PATH=$(realpath "$TRANSCRIPT_PATH" 2>/dev/null || echo "")
  case "$RESOLVED_PATH" in
    "$HOME"/*) ;; # within home directory — OK
    *)
      TRANSCRIPT_PATH=""  # outside home directory — reject
      ;;
  esac
fi
# ──────────────────────────────────────────────────────────────────────

# --- Primary check: Transcript file size ---
TRANSCRIPT_LEVEL="NONE"
TRANSCRIPT_MSG=""

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')

  WARN_THRESHOLD="${CONTEXT_WARN:-100000}"
  ALERT_THRESHOLD="${CONTEXT_ALERT:-200000}"
  CRITICAL_THRESHOLD="${CONTEXT_CRITICAL:-300000}"

  if [ "$FILE_SIZE" -ge "$CRITICAL_THRESHOLD" ]; then
    TRANSCRIPT_LEVEL="CRITICAL"
    TRANSCRIPT_MSG="Context usage is very high (~${FILE_SIZE} bytes transcript). Quality may be degrading. Consider running /compact to free context space, or start a new session."
  elif [ "$FILE_SIZE" -ge "$ALERT_THRESHOLD" ]; then
    TRANSCRIPT_LEVEL="HIGH"
    TRANSCRIPT_MSG="Context usage is high (~${FILE_SIZE} bytes transcript). Consider running /compact soon to maintain response quality."
  elif [ "$FILE_SIZE" -ge "$WARN_THRESHOLD" ]; then
    TRANSCRIPT_LEVEL="MODERATE"
    TRANSCRIPT_MSG="Context usage is moderate (~${FILE_SIZE} bytes transcript). No action needed yet, but be mindful of context limits."
  fi
fi

# --- Resolve: use transcript level directly ---
# WORKING.md, BRAIN.md, and MEMORY.md size checks removed (sunset in v9.2.0).
# Session context is now tracked in MuninnDB, not local .planning/ files.

FINAL_LEVEL="$TRANSCRIPT_LEVEL"
FINAL_MSG="$TRANSCRIPT_MSG"

# Exit if no signal
if [ "$FINAL_LEVEL" = "NONE" ]; then
  exit 0
fi

# --- Collect state.json size for breakdown ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
STATE_JSON="$PROJECT_DIR/.planning/state.json"
STATE_JSON_SIZE=0
if [ -f "$STATE_JSON" ]; then
  STATE_JSON_SIZE=$(wc -c < "$STATE_JSON" | tr -d ' ')
fi

# --- Output warning message ---
# Claude Code: systemMessage, Cursor: followup_message
HOOK_LEVEL="$FINAL_LEVEL" \
HOOK_MSG="$FINAL_MSG" \
HOOK_STATE_JSON_SIZE="$STATE_JSON_SIZE" \
bun -e "
  const level = process.env.HOOK_LEVEL;
  const message = process.env.HOOK_MSG;
  const text = '[Context Monitor: ' + level + '] ' + message;
  const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
  const msg = isClaude ? { systemMessage: text } : { followup_message: text };
  msg.context_breakdown = {
    state_json_bytes: parseInt(process.env.HOOK_STATE_JSON_SIZE || '0', 10),
  };
  process.stdout.write(JSON.stringify(msg));
"

exit 0
