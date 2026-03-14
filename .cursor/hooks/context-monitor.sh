#!/usr/bin/env bash
# context-monitor.sh -- Warn when context usage appears high
#
# Canonical event: stop
# Platform events: Claude=Stop, Cursor=stop, Pi=session_shutdown
# Type: Command hook (synchronous)
# Timeout: 5 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: { "stop_hook_active": bool, "transcript_path": "/path/..." }
# Cursor:      { "loop_count": number }
# Pi:          {}
#
# Extraction (loop guard): data.stop_hook_active || data.loop_count > 0
# Extraction (transcript): data.transcript_path
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# On context warning:
#   Claude: { "systemMessage": "[Context Monitor: LEVEL] ..." }
#   Cursor: { "followup_message": "[Context Monitor: LEVEL] ..." }
# On healthy context: no output
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (context check is advisory)
# ──────────────────────────────────────────────────────────────────────
#
# Checks context usage via transcript file size:
#
#    CONTEXT_WARN=100000      (~100KB, ~30% context)
#    CONTEXT_ALERT=200000     (~200KB, ~50% context)
#    CONTEXT_CRITICAL=300000  (~300KB, ~70% context)
#
# NOTE: WORKING.md size was previously used as a fallback signal.
# Memory is now handled by MuninnDB MCP, so only transcript size
# is used for context monitoring.
#
# Outputs a systemMessage warning when thresholds are exceeded.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Source shared hook library
HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

guard_dedup "context-monitor"

# Read stdin JSON (may be empty for some platforms)
INPUT=$(cat || true)

# Handle empty or malformed stdin gracefully
if [ -z "$INPUT" ]; then
  INPUT="{}"
fi

# Check stop_hook_active (Claude) or loop_count (Cursor) to prevent infinite loops
# If this Stop was triggered by a previous Stop hook, exit immediately
IS_ACTIVE=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    const active = data.stop_hook_active || (data.loop_count > 0) || false;
    process.stdout.write(String(active));
  } catch { process.stdout.write('false'); }
" 2>/dev/null || echo "false")

if [ "$IS_ACTIVE" = "true" ]; then
  exit 0
fi

# Extract transcript path
TRANSCRIPT_PATH=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    const tp = data.transcript_path;
    if (tp) process.stdout.write(tp);
  } catch { /* malformed JSON — no transcript path */ }
" 2>/dev/null || true)

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

# --- Primary check: Prefer real metrics from statusline ---
TRANSCRIPT_LEVEL="NONE"
TRANSCRIPT_MSG=""
USED_STATUSLINE=false

# Check for fresh statusline data (within 120 seconds)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
SL_METRICS_FILE="$PROJECT_DIR/.planning/.context-metrics.json"
if [ -f "$SL_METRICS_FILE" ]; then
  SL_DATA=$(HOOK_METRICS="$SL_METRICS_FILE" bun -e "
    try {
      const m = JSON.parse(await Bun.file(process.env.HOOK_METRICS).text());
      if (m.source !== 'statusline') { process.exit(0); }
      const checkedAt = new Date(m.checked_at).getTime();
      const now = Date.now();
      if (now - checkedAt > 120000) { process.exit(0); }
      process.stdout.write(JSON.stringify({
        pct: m.usage_percent,
        input: m.total_input_tokens || 0,
        window: m.context_window_size || 0,
      }));
    } catch { process.exit(0); }
  " 2>/dev/null || echo "")

  if [ -n "$SL_DATA" ]; then
    SL_PCT=$(printf '%s' "$SL_DATA" | bun -e "const d=JSON.parse(await Bun.stdin.text()); process.stdout.write(String(d.pct||0));" 2>/dev/null || echo "0")
    SL_INPUT=$(printf '%s' "$SL_DATA" | bun -e "const d=JSON.parse(await Bun.stdin.text()); const n=d.input||0; process.stdout.write(n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n));" 2>/dev/null || echo "?")
    SL_WINDOW=$(printf '%s' "$SL_DATA" | bun -e "const d=JSON.parse(await Bun.stdin.text()); const n=d.window||0; process.stdout.write(n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?Math.round(n/1e3)+'K':String(n));" 2>/dev/null || echo "?")

    if [ "$SL_PCT" -ge 70 ]; then
      TRANSCRIPT_LEVEL="CRITICAL"
      TRANSCRIPT_MSG="Context at ${SL_PCT}% (${SL_INPUT}/${SL_WINDOW} tokens). Quality may be degrading. Consider running /compact to free context space, or start a new session."
    elif [ "$SL_PCT" -ge 50 ]; then
      TRANSCRIPT_LEVEL="HIGH"
      TRANSCRIPT_MSG="Context at ${SL_PCT}% (${SL_INPUT}/${SL_WINDOW} tokens). Consider running /compact soon to maintain response quality."
    elif [ "$SL_PCT" -ge 30 ]; then
      TRANSCRIPT_LEVEL="MODERATE"
      TRANSCRIPT_MSG="Context at ${SL_PCT}% (${SL_INPUT}/${SL_WINDOW} tokens). No action needed yet, but be mindful of context limits."
    fi
    USED_STATUSLINE=true
  fi
fi

# Fallback: transcript file size heuristic
if [ "$USED_STATUSLINE" = "false" ] && [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
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

# --- Context file size breakdown ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
STATE_MD="$PROJECT_DIR/.planning/STATE.md"

STATE_SIZE=0
STATE_JSON="$PROJECT_DIR/.planning/state.json"
STATE_JSON_SIZE=0

if [ -f "$STATE_MD" ]; then
  STATE_SIZE=$(wc -c < "$STATE_MD" | tr -d ' ')
fi
if [ -f "$STATE_JSON" ]; then
  STATE_JSON_SIZE=$(wc -c < "$STATE_JSON" | tr -d ' ')
fi

TOTAL_CONTEXT_BYTES=$((STATE_SIZE + STATE_JSON_SIZE))

# Use transcript level directly (no fallback signal needed)
FINAL_LEVEL="$TRANSCRIPT_LEVEL"
FINAL_MSG="$TRANSCRIPT_MSG"

# Exit if NONE
if [ "$FINAL_LEVEL" = "NONE" ]; then
  exit 0
fi

# --- Output warning message with context breakdown ---
# Claude Code: systemMessage, Cursor: followup_message
# Includes context_breakdown for informational purposes (ignored by platforms)
HOOK_LEVEL="$FINAL_LEVEL" \
HOOK_MSG="$FINAL_MSG" \
HOOK_STATE_SIZE="$STATE_SIZE" \
HOOK_STATE_JSON_SIZE="$STATE_JSON_SIZE" \
HOOK_TOTAL_SIZE="$TOTAL_CONTEXT_BYTES" \
bun -e "
  const level = process.env.HOOK_LEVEL;
  const message = process.env.HOOK_MSG;
  const text = '[Context Monitor: ' + level + '] ' + message;
  const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
  const msg = isClaude ? { systemMessage: text } : { followup_message: text };
  msg.context_breakdown = {
    state_bytes: parseInt(process.env.HOOK_STATE_SIZE || '0', 10),
    state_json_bytes: parseInt(process.env.HOOK_STATE_JSON_SIZE || '0', 10),
    total_bytes: parseInt(process.env.HOOK_TOTAL_SIZE || '0', 10),
  };
  process.stdout.write(JSON.stringify(msg));
"

exit 0
