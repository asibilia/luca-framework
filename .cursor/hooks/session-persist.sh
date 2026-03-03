#!/usr/bin/env bash
# session-persist.sh — Save session state on exit
#
# Hook event: SessionEnd
# Type: Command hook (synchronous)
# Timeout: 10 seconds
#
# When a session ends, this hook:
# 1. Checks if .planning/WORKING.md exists
# 2. If it has content, appends a session-end timestamp
# 3. Best-effort only — SessionEnd hooks cannot block termination
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Ensure node_modules/.bin is in PATH for installed-package context
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

# Read stdin JSON
INPUT=$(cat)

# Use CLAUDE_PROJECT_DIR env var (consistent with other hooks)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Extract session end reason (for logging)
END_REASON=$(printf '%s' "$INPUT" | bun -e "
  const data = JSON.parse(await Bun.stdin.text());
  process.stdout.write(data.reason || 'unknown');
")

# ─── SEC-02: Sanitize END_REASON ───────────────────────────────────────
# Allow only alphanumeric, spaces, hyphens, underscores, and periods.
# Prevents markdown injection into WORKING.md.
END_REASON=$(printf '%s' "$END_REASON" | tr -cd '[:alnum:] _.-')
# Truncate to 100 characters to prevent absurdly long reason strings.
END_REASON="${END_REASON:0:100}"
# ──────────────────────────────────────────────────────────────────────

# Remove session lock (before any other cleanup — most important action)
rm -f "$PROJECT_DIR/.claude/.session-lock"

WORKING_MD="$PROJECT_DIR/.planning/WORKING.md"

# Exit if WORKING.md doesn't exist
if [ ! -f "$WORKING_MD" ]; then
  exit 0
fi

# Exit if WORKING.md is empty
if [ ! -s "$WORKING_MD" ]; then
  exit 0
fi

# Get current timestamp
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Append session-end footer
# Check if file already has a session-end marker to avoid duplicates
if grep -q "^---$" "$WORKING_MD" && grep -q "Session ended:" "$WORKING_MD"; then
  # Already has a session-end marker — update it using Bun APIs
  HOOK_WMD="$WORKING_MD" HOOK_TS="$TIMESTAMP" HOOK_REASON="$END_REASON" bun -e "
    const path = process.env.HOOK_WMD;
    const ts = process.env.HOOK_TS;
    const reason = process.env.HOOK_REASON;
    let content = await Bun.file(path).text();
    content = content.replace(
      /\*Session ended:.*\*/,
      '*Session ended: ' + ts + ' (reason: ' + reason + ')*'
    );
    await Bun.write(path, content);
  "
else
  # No session-end marker — append one
  printf '\n\n---\n*Session ended: %s (reason: %s)*\n' "$TIMESTAMP" "$END_REASON" >> "$WORKING_MD"
fi

exit 0
