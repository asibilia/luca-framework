#!/usr/bin/env bash
# session-persist.sh — Save session state on exit
#
# Canonical event: session_end
# Platform events: Claude=SessionEnd, Cursor=sessionEnd, Pi=session_shutdown
# Type: Command hook (synchronous)
# Timeout: 10 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: { "reason": "user_exit" | "timeout" | ... }
# Cursor:      { "reason": "..." }
# Pi:          {}
#
# Extraction: data.reason || 'unknown'
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# No stdout output (session persistence is silent)
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (SessionEnd hooks cannot block termination)
# ──────────────────────────────────────────────────────────────────────
#
# When a session ends, this hook:
# 1. Removes the session lock file
# 2. Emits a session.end event to SpacetimeDB
# 3. Best-effort only — SessionEnd hooks cannot block termination
#
# NOTE: Session memory persistence is now handled by MuninnDB MCP
# (muninn_session tracks session lifecycle natively). WORKING.md
# operations have been removed.
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Source shared hook library
HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

# Read stdin JSON (may be empty for some platforms)
INPUT=$(cat || true)

# Handle empty or malformed stdin gracefully
if [ -z "$INPUT" ]; then
  INPUT="{}"
fi

# Use CLAUDE_PROJECT_DIR env var (consistent with other hooks)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Extract session end reason (for logging)
END_REASON=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    process.stdout.write(data.reason || 'unknown');
  } catch { process.stdout.write('unknown'); }
" 2>/dev/null || echo "unknown")

# ─── SEC-02: Sanitize END_REASON ───────────────────────────────────────
# Allow only alphanumeric, spaces, hyphens, underscores, and periods.
# Prevents injection into event payloads.
END_REASON=$(printf '%s' "$END_REASON" | tr -cd '[:alnum:] _.-')
# Truncate to 100 characters to prevent absurdly long reason strings.
END_REASON="${END_REASON:0:100}"
# ──────────────────────────────────────────────────────────────────────

# Remove session lock (before any other cleanup — most important action)
rm -f "$PROJECT_DIR/.claude/.session-lock"

# Emit session.end event to SpacetimeDB (fire-and-forget via bridge)
SESSION_ID=$(read_session_id)
if [ -n "$SESSION_ID" ]; then
  run_bridge emit-event --type=session.end --session="$SESSION_ID" --data="{\"reason\":\"$END_REASON\"}" &>/dev/null &
fi

exit 0
