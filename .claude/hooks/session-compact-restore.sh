#!/usr/bin/env bash
# session-compact-restore.sh -- Restore context checkpoint after compaction
#
# Canonical event: session_start
# Platform events: Claude=SessionStart, Cursor=sessionStart, Pi=session_start
# Type: Command hook (synchronous — must inject before LLM responds)
# Timeout: 10 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: {}  (no meaningful payload)
# Stdin is consumed but not parsed.
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# On checkpoint found:
#   { "systemMessage": "[Context Restored] Resuming after compaction. ..." }
# On no checkpoint: no output (exit silently)
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = always (session start should never block)
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail
export PATH="${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin:$PATH"

HOOK_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${HOOK_SCRIPT_DIR}/_lib/common.sh"

guard_dedup "session-compact-restore"

# Consume stdin (standard pattern)
INPUT=$(cat || true)

# --- Check for checkpoint ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CHECKPOINT_FILE="$PROJECT_DIR/.planning/.context-checkpoint.json"

if [ ! -f "$CHECKPOINT_FILE" ]; then
  # No checkpoint = not a post-compaction restart
  exit 0
fi

# --- Read checkpoint and format systemMessage ---
RESTORE_MSG=$(HOOK_CHECKPOINT_FILE="$CHECKPOINT_FILE" bun -e "
  try {
    const cp = JSON.parse(await Bun.file(process.env.HOOK_CHECKPOINT_FILE).text());
    const pos = cp.position || {};
    const lines = [
      '[Context Restored] Resuming after compaction.',
      '',
      'Position: Phase ' + (pos.phase || 'unknown') + ', Complexity: ' + (pos.complexity || 'MODERATE') + ', Milestone: ' + (pos.milestone || 'unknown'),
      'Trigger: ' + (cp.trigger || 'unknown') + ' compaction',
      '',
      'Recent work:',
      (cp.completed_summary || 'No recent commits recorded'),
      '',
      'MuninnDB vault: ' + (cp.vault || 'luca-framework'),
      '',
      'Run /context-restore for deeper context recovery with semantic recall.',
    ];
    process.stdout.write(lines.join('\\n'));
  } catch (e) {
    process.stdout.write('[Context Restored] Checkpoint found but could not be parsed. Run /context-restore for manual recovery.');
  }
" 2>/dev/null || echo "[Context Restored] Checkpoint found but could not be read. Run /context-restore for manual recovery.")

# Output systemMessage
if [ -n "$RESTORE_MSG" ]; then
  HOOK_MSG="$RESTORE_MSG" bun -e "
    const msg = process.env.HOOK_MSG;
    process.stdout.write(JSON.stringify({ systemMessage: msg }));
  " 2>/dev/null || true
fi

# --- Clean up checkpoint file ---
rm -f "$CHECKPOINT_FILE" 2>/dev/null || true

exit 0
