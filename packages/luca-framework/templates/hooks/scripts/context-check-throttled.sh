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
# On degrading/stop context:
#   { "systemMessage": "Context usage at X% (zone: degrading/stop). ..." }
# On healthy context: no output
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (async hook, non-blocking)
# ──────────────────────────────────────────────────────────────────────
#
# Estimates context usage from transcript file size on a throttled basis.
# Skips execution if the last check was less than 60 seconds ago
# (tracked via a timestamp file in /tmp).
#
# Only outputs a systemMessage when the context zone is "degrading" or "stop".
# Silent when context usage is healthy (peak or good zones).

set -euo pipefail

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

# --- Run context monitor ---
# Estimate context usage from transcript file size.
# The old src/memory/context-monitor.ts module was removed during the
# MuninnDB migration (Phase 09). Context monitoring now uses direct
# transcript-size heuristics.

ZONE="peak"
USAGE_PERCENT=0

# Find transcript path from Claude session dir
TRANSCRIPT_PATH=""
if [ -n "${CLAUDE_SESSION_DIR:-}" ] && [ -d "$CLAUDE_SESSION_DIR" ]; then
  TRANSCRIPT_PATH=$(find "$CLAUDE_SESSION_DIR" -name "transcript" -type f 2>/dev/null | head -1)
fi

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')
  # Thresholds for context zone classification
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
