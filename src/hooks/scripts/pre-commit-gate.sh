#!/usr/bin/env bash
# pre-commit-gate.sh — Block commits when quality checks fail
#
# Canonical event: pre_tool_use (tool_filter: Bash)
# Platform events: Claude=PreToolUse, Cursor=beforeShellExecution, Pi=tool_call
# Type: Command hook (synchronous)
# Timeout: 120 seconds
#
# ─── STDIN CONTRACT ───────────────────────────────────────────────────
# Claude Code: { "tool_input": { "command": "git commit -m 'msg'" } }
# Cursor:      { "command": "git commit -m 'msg'" }
# Pi:          { "tool_input": { "command": "git commit -m 'msg'" } }
#
# Extraction: data.tool_input?.command ?? data.command ?? ''
# ─── STDOUT CONTRACT ─────────────────────────────────────────────────
# On block (quality checks fail):
#   Claude: { "hookSpecificOutput": { "permissionDecision": "deny", "permissionDecisionReason": "..." } }
#   Cursor: { "permission": "deny", "user_message": "..." }
# On allow: no output
# ─── EXIT CODES ──────────────────────────────────────────────────────
# 0 = allow (command proceeds)
# 2 = block (commit denied)
# ──────────────────────────────────────────────────────────────────────
#
# Intercepts all Bash tool calls. For non-commit commands, exits 0 immediately
# (near-zero overhead). For commit commands, runs quality checks (tests + tsc)
# and blocks the commit if any fail.
#
# Runtime detection: Reads .planning/config.json for "runtime" field,
# falls back to command -v detection. Uses bun or node/npm/npx accordingly.
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
  exit 0
fi

# ─── COMMAND EXTRACTION: SECURITY NOTES ───────────────────────────────
#
# INPUT FORMAT (two platforms):
#   Claude Code: { "tool_input": { "command": "git commit -m 'msg'" } }
#   Cursor:      { "command": "git commit -m 'msg'" }
#
# EXTRACTION METHOD:
#   Uses bun -e with JSON.parse() to safely extract the command string.
#   No shell interpolation occurs — the command is never eval'd or exec'd.
#   The printf '%s' format prevents format string injection.
#
# MATCHING STRATEGY:
#   The case statement uses shell glob patterns (NOT regex).
#   Only substring matches are checked — the command is never executed.
#   This is safe because:
#     1. case/esac does pattern matching, not execution
#     2. $COMMAND is double-quoted, preventing word splitting
#     3. No eval, exec, or subshell uses $COMMAND
#
# MAINTENANCE WARNING:
#   - NEVER eval, exec, or source $COMMAND — it contains untrusted input
#   - NEVER use $COMMAND in arithmetic expressions
#   - Adding new case patterns is safe (glob matching only)
#   - If you need to pass $COMMAND to another tool, use environment
#     variables (like HOOK_CMD="$COMMAND" bun -e "...") — NOT arguments
# ──────────────────────────────────────────────────────────────────────
COMMAND=$(printf '%s' "$INPUT" | bun -e "
  try {
    const data = JSON.parse(await Bun.stdin.text());
    const cmd = data.tool_input?.command ?? data.command ?? '';
    process.stdout.write(cmd);
  } catch { process.stdout.write(''); }
" 2>/dev/null || true)

# Fast exit: Not a commit command? Allow immediately.
# This check must be near-instant since it runs on EVERY Bash call.
case "$COMMAND" in
  *"git commit"*|*"git merge"*|*"bun run commit"*|*"bunx commit"*|*"bunx --bun commit"*)
    # Potentially a commit command — continue to quality checks
    ;;
  *)
    # Not a commit command — allow immediately
    exit 0
    ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# --- Advisory: pending developer notes ---
NOTES_DIR="$PROJECT_DIR/.planning/notes"
if [ -d "$NOTES_DIR" ]; then
  ALL_NOTES=$(find "$NOTES_DIR" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  URGENT_NOTES=$(find "$NOTES_DIR" -maxdepth 1 -name '0-*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [ "$ALL_NOTES" -gt 0 ]; then
    echo "[Developer Notes] $ALL_NOTES pending note(s) ($URGENT_NOTES urgent). Review .planning/notes/ before committing." >&2
  fi
fi

# Step 0: Sync STATE.md from state machine (if available)
# This ensures commits always contain a STATE.md matching machine state.
STATE_JSON="$PROJECT_DIR/.planning/state.json"

if [ -f "$STATE_JSON" ]; then
  cd "$PROJECT_DIR"
  run_bridge snapshot 2>/dev/null || true
  # Add the regenerated STATE.md to the commit staging area
  git add .planning/STATE.md 2>/dev/null || true
fi

RUNTIME=$(read_runtime)

ERRORS=""
HAS_ERRORS=0

# Quality Check 1: Run tests
# DISABLED: Tests removed wholesale to unblock development (agents spawning
# bun test via pre-commit gate were orphaning hundreds of processes and
# freezing the machine). Will be selectively re-added in a dedicated effort.
# See: .planning/notes/todo-reintroduce-tests.md
TEST_EXIT=0

# Quality Check 2: Type-check (if tsconfig.json exists)
if [ -f "$PROJECT_DIR/tsconfig.json" ]; then
  echo "Running type-checker before commit..." >&2
  set +e
  if [ "$RUNTIME" = "bun" ]; then
    TSC_OUTPUT=$(cd "$PROJECT_DIR" && bunx --bun tsc --noEmit 2>&1)
  else
    TSC_OUTPUT=$(cd "$PROJECT_DIR" && npx tsc --noEmit 2>&1)
  fi
  TSC_EXIT=$?
  set -e

  if [ $TSC_EXIT -ne 0 ] && [ -n "$TSC_OUTPUT" ]; then
    HAS_ERRORS=1
    TSC_SUMMARY=$(echo "$TSC_OUTPUT" | head -20)
    TSC_LINES=$(echo "$TSC_OUTPUT" | wc -l | tr -d ' ')
    if [ "$TSC_LINES" -gt 20 ]; then
      TSC_SUMMARY="$TSC_SUMMARY
... ($TSC_LINES total type errors, showing first 20)"
    fi
    ERRORS="${ERRORS}
## Type Errors
\`\`\`
${TSC_SUMMARY}
\`\`\`
"
  fi
fi

# If any checks failed, block the commit
if [ $HAS_ERRORS -ne 0 ]; then
  REASON="Commit blocked by pre-commit quality gate. Fix the following issues before committing:
${ERRORS}"

  # Output JSON decision to stdout
  # Claude Code: hookSpecificOutput.permissionDecision, Cursor: permission + user_message
  printf '%s' "$REASON" | bun -e "
    const reason = await Bun.stdin.text();
    const isClaude = !!process.env.CLAUDE_PROJECT_DIR;
    const output = isClaude
      ? { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason.trim() } }
      : { permission: 'deny', user_message: reason.trim() };
    process.stdout.write(JSON.stringify(output));
  "

  # Exit 2 = block
  exit 2
fi

# Allow the commit
exit 0
