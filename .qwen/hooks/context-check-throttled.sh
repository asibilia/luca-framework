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

# Cascading bridge lookup: installed bin → monorepo source → skip
run_bridge() {
  if command -v luca-bridge &>/dev/null; then
    luca-bridge "$@"
  elif [ -f "${CLAUDE_PROJECT_DIR:-.}/packages/luca-framework/src/state/bridge.ts" ]; then
    bun run "${CLAUDE_PROJECT_DIR:-.}/packages/luca-framework/src/state/bridge.ts" "$@"
  fi
}

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

# --- Check for urgent developer notes ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
NOTES_DIR="$PROJECT_DIR/.planning/notes"
if [ -d "$NOTES_DIR" ]; then
  URGENT_NOTES=$(ls "$NOTES_DIR"/0-*.md 2>/dev/null | head -5)
  if [ -n "$URGENT_NOTES" ]; then
    NOTE_CONTENT=""
    for note_file in $URGENT_NOTES; do
      # Extract body (skip frontmatter between --- delimiters)
      BODY=$(awk '/^---$/ {f=!f; next} !f' "$note_file" | tr '\n' ' ' | xargs)
      NOTE_CONTENT="${NOTE_CONTENT}\n- ${BODY}"
      # Move to done/
      mkdir -p "$NOTES_DIR/done"
      mv "$note_file" "$NOTES_DIR/done/" 2>/dev/null || true
    done
    # Emit note.consumed via bridge (fire-and-forget)
    run_bridge emit-event --type=note.consumed &>/dev/null &
    printf '{"systemMessage": "[Developer Notes] Urgent notes to incorporate:%b"}' "$NOTE_CONTENT"
    exit 0
  fi
fi

# --- Run context monitor ---

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

# Emit context snapshot via bridge (fire-and-forget)
SESSION_ID=""
if [ -f "$PROJECT_DIR/.planning/state.json" ]; then
  SESSION_ID=$(bun -e "
    try {
      const s = JSON.parse(await Bun.file('$PROJECT_DIR/.planning/state.json').text());
      process.stdout.write(s.context?.session_id || '');
    } catch { process.stdout.write(''); }
  " 2>/dev/null || echo "")
fi
if [ -n "$SESSION_ID" ] && [ -n "${RESULT:-}" ]; then
  CONTEXT_PERCENT=$(printf '%s' "$RESULT" | bun -e "
    try { const d = JSON.parse(await Bun.stdin.text()); process.stdout.write(String(Math.round(d.usage_percent || 0))); } catch { process.stdout.write('0'); }
  " 2>/dev/null || echo "0")
  EST_TOKENS=$(printf '%s' "$RESULT" | bun -e "
    try { const d = JSON.parse(await Bun.stdin.text()); process.stdout.write(String(d.total_tokens || 0)); } catch { process.stdout.write('0'); }
  " 2>/dev/null || echo "0")
  run_bridge emit-context-snapshot --session="$SESSION_ID" --percent="$CONTEXT_PERCENT" --tokens="$EST_TOKENS" &>/dev/null &
fi

exit 0
