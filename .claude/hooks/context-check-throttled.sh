#!/usr/bin/env bash
# context-check-throttled.sh -- PostToolUse throttled context monitor
#
# Canonical event: post_tool_use (no tool_filter)
# Platform events: Claude=PostToolUse, Cursor=afterFileEdit, Pi=tool_execution_end
# Type: Command hook (asynchronous, does not block tool use)
# Timeout: 10 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: { "tool_input": { ... } }  (varies by tool)
# Cursor:      { ... }                     (varies by tool)
# Pi:          { "tool_input": { ... } }   (varies by tool)
#
# This hook does not parse stdin — it uses throttle-based context monitoring.
# Stdin is not consumed (no cat call). Platform closes the pipe automatically.
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# On urgent notes:
#   { "systemMessage": "[Developer Notes] Urgent notes to incorporate: ..." }
# On degrading/stop context:
#   { "systemMessage": "Context usage at X% (zone: degrading/stop). ..." }
# On healthy context: no output
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (async hook, non-blocking)
# ──────────────────────────────────────────────────────────────────────
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

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Source shared hook library
HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

guard_dedup "context-check-throttled"

# --- Throttle check ---
PROJECT_HASH=$(printf '%s' "${CLAUDE_PROJECT_DIR:-.}" | shasum -a 256 | cut -c1-8)
THROTTLE_FILE="/tmp/.luca-context-check-${PROJECT_HASH}-ts"
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

# --- Check for urgent developer notes ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
NOTES_DIR="$PROJECT_DIR/.planning/notes"
if [ -d "$NOTES_DIR" ]; then
  URGENT_NOTES=()
  while IFS= read -r f; do URGENT_NOTES+=("$f"); done < <(find "$NOTES_DIR" -maxdepth 1 -name '0-*.md' 2>/dev/null | head -5)
  if [ "${#URGENT_NOTES[@]}" -gt 0 ]; then
    NOTE_CONTENT=""
    for note_file in "${URGENT_NOTES[@]}"; do
      # Extract body (skip frontmatter between --- delimiters)
      BODY=$(awk '/^---$/ {f=!f; next} !f' "$note_file" | tr '\n' ' ' | xargs)
      NOTE_CONTENT="${NOTE_CONTENT}\n- ${BODY}"
      # Move to done/
      mkdir -p "$NOTES_DIR/done"
      mv "$note_file" "$NOTES_DIR/done/" 2>/dev/null || true
    done
    printf '{"systemMessage": "[Developer Notes] Urgent notes to incorporate:%b"}' "$NOTE_CONTENT"
    exit 0
  fi
fi

# --- Run context monitor ---
# Estimate context usage from transcript file size.
# The old src/memory/context-monitor.ts module has been removed; context
# monitoring now uses direct transcript-size heuristics (same approach as
# context-monitor.sh but lightweight for the throttled PostToolUse path).

ZONE="peak"
USAGE_PERCENT=0

# Find transcript path from Claude session dir
TRANSCRIPT_PATH=""
if [ -n "${CLAUDE_SESSION_DIR:-}" ] && [ -d "$CLAUDE_SESSION_DIR" ]; then
  TRANSCRIPT_PATH=$(find "$CLAUDE_SESSION_DIR" -name "transcript" -type f 2>/dev/null | head -1)
fi

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')
  # Thresholds aligned with context-monitor.sh
  WARN_THRESHOLD="${CONTEXT_WARN:-100000}"
  ALERT_THRESHOLD="${CONTEXT_ALERT:-200000}"
  CRITICAL_THRESHOLD="${CONTEXT_CRITICAL:-300000}"
  # Estimate usage percent (300KB ~ 70% context)
  USAGE_PERCENT=$((FILE_SIZE * 70 / CRITICAL_THRESHOLD))
  if [ "$USAGE_PERCENT" -gt 100 ]; then USAGE_PERCENT=100; fi

  if [ "$FILE_SIZE" -ge "$CRITICAL_THRESHOLD" ]; then
    ZONE="stop"
  elif [ "$FILE_SIZE" -ge "$ALERT_THRESHOLD" ]; then
    ZONE="degrading"
  elif [ "$FILE_SIZE" -ge "$WARN_THRESHOLD" ]; then
    ZONE="good"
  fi
fi

# Only output warning for degrading or stop zones
if [ "$ZONE" = "degrading" ] || [ "$ZONE" = "stop" ]; then
  printf '{"systemMessage": "Context usage at %s%% (zone: %s). Consider compressing memory or starting a new session."}' "$USAGE_PERCENT" "$ZONE"
fi

exit 0
