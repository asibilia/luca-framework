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
# Prefer real token data from statusline (written to .context-metrics.json).
# Fall back to transcript-size heuristic if statusline data is stale or missing.

ZONE="peak"
USAGE_PERCENT=0
FILE_SIZE=0
METRICS_SOURCE="transcript_heuristic"

# Check if fresh statusline data exists (within 120 seconds)
STATUSLINE_FRESH=false
METRICS_FILE="$PROJECT_DIR/.planning/.context-metrics.json"
if [ -f "$METRICS_FILE" ]; then
  STATUSLINE_DATA=$(HOOK_METRICS="$METRICS_FILE" bun -e "
    try {
      const m = JSON.parse(await Bun.file(process.env.HOOK_METRICS).text());
      if (m.source !== 'statusline') { process.exit(0); }
      const checkedAt = new Date(m.checked_at).getTime();
      const now = Date.now();
      if (now - checkedAt > 120000) { process.exit(0); }
      // Fresh statusline data — output zone and percent
      process.stdout.write(JSON.stringify({ zone: m.zone, usage_percent: m.usage_percent }));
    } catch { process.exit(0); }
  " 2>/dev/null || echo "")

  if [ -n "$STATUSLINE_DATA" ]; then
    ZONE=$(printf '%s' "$STATUSLINE_DATA" | bun -e "
      const d = JSON.parse(await Bun.stdin.text());
      process.stdout.write(d.zone || 'peak');
    " 2>/dev/null || echo "peak")
    USAGE_PERCENT=$(printf '%s' "$STATUSLINE_DATA" | bun -e "
      const d = JSON.parse(await Bun.stdin.text());
      process.stdout.write(String(d.usage_percent || 0));
    " 2>/dev/null || echo "0")
    STATUSLINE_FRESH=true
    METRICS_SOURCE="statusline"
  fi
fi

# Fallback: estimate from transcript file size if no fresh statusline data
if [ "$STATUSLINE_FRESH" = "false" ]; then
  TRANSCRIPT_PATH=""
  if [ -n "${CLAUDE_SESSION_DIR:-}" ] && [ -d "$CLAUDE_SESSION_DIR" ]; then
    TRANSCRIPT_PATH=$(find "$CLAUDE_SESSION_DIR" -name "transcript" -type f 2>/dev/null | head -1)
  fi

  if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    FILE_SIZE=$(wc -c < "$TRANSCRIPT_PATH" | tr -d ' ')
    WARN_THRESHOLD="${CONTEXT_WARN:-100000}"
    ALERT_THRESHOLD="${CONTEXT_ALERT:-200000}"
    CRITICAL_THRESHOLD="${CONTEXT_CRITICAL:-300000}"
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
fi

# --- Zone severity for transition detection ---
zone_severity() {
  case "$1" in
    peak)      echo 0 ;;
    good)      echo 1 ;;
    degrading) echo 2 ;;
    stop)      echo 3 ;;
    *)         echo 0 ;;
  esac
}

# --- Read previous zone (before overwriting metrics) ---
PREV_ZONE="peak"
if [ -f "$METRICS_FILE" ]; then
  PREV_ZONE=$(HOOK_METRICS="$METRICS_FILE" bun -e "
    try {
      const m = JSON.parse(await Bun.file(process.env.HOOK_METRICS).text());
      process.stdout.write(m.zone || 'peak');
    } catch { process.stdout.write('peak'); }
  " 2>/dev/null || echo "peak")
fi

# --- Write context metrics snapshot (only if using heuristic — statusline writes its own) ---
if [ "$STATUSLINE_FRESH" = "false" ]; then
  HOOK_ZONE="$ZONE" \
  HOOK_PERCENT="$USAGE_PERCENT" \
  HOOK_FILE_SIZE="${FILE_SIZE:-0}" \
  HOOK_PROJECT_DIR="$PROJECT_DIR" \
  bun -e "
    const zone = process.env.HOOK_ZONE;
    const percent = parseInt(process.env.HOOK_PERCENT || '0', 10);
    const fileSize = parseInt(process.env.HOOK_FILE_SIZE || '0', 10);
    const projectDir = process.env.HOOK_PROJECT_DIR;
    const metrics = {
      zone,
      usage_percent: percent,
      transcript_bytes: fileSize,
      checked_at: new Date().toISOString(),
      source: 'transcript_heuristic',
    };
    await Bun.write(
      projectDir + '/.planning/.context-metrics.json',
      JSON.stringify(metrics, null, 2) + '\n'
    );
  " 2>/dev/null || true
fi

# --- Proactive checkpoint on zone worsening ---
PREV_SEV=$(zone_severity "$PREV_ZONE")
CURR_SEV=$(zone_severity "$ZONE")

if [ "$CURR_SEV" -gt "$PREV_SEV" ]; then
  # Zone worsened — consider proactive checkpoint
  CHECKPOINT_THROTTLE_FILE="/tmp/.luca-ctx-checkpoint-${PROJECT_HASH}-ts"
  CHECKPOINT_THROTTLE_SECONDS=300
  SHOULD_CHECKPOINT=true

  if [ -f "$CHECKPOINT_THROTTLE_FILE" ]; then
    LAST_CP=$(cat "$CHECKPOINT_THROTTLE_FILE" 2>/dev/null || echo "0")
    NOW_CP=$(date +%s)
    if [ $((NOW_CP - LAST_CP)) -lt "$CHECKPOINT_THROTTLE_SECONDS" ]; then
      SHOULD_CHECKPOINT=false
    fi
  fi

  if [ "$SHOULD_CHECKPOINT" = "true" ]; then
    date +%s > "$CHECKPOINT_THROTTLE_FILE"
    run_bridge snapshot 2>/dev/null || true
  fi
fi

# Only output warning for degrading or stop zones
if [ "$ZONE" = "degrading" ] || [ "$ZONE" = "stop" ]; then
  printf '{"systemMessage": "Context usage at %s%% (zone: %s). Consider compressing memory or starting a new session."}' "$USAGE_PERCENT" "$ZONE"
fi

exit 0
