#!/usr/bin/env bash
# pre-commit-gate.sh — Block commits when quality checks fail
#
# Hook event: PreToolUse (matcher: Bash)
# Type: Command hook (synchronous)
# Timeout: 120 seconds
#
# Intercepts all Bash tool calls. For non-commit commands, exits 0 immediately
# (near-zero overhead). For commit commands, runs quality checks (tests + tsc)
# and blocks the commit if any fail.
#
# Runtime detection: Reads .planning/config.json for "runtime" field,
# falls back to command -v detection. Uses bun or node/npm/npx accordingly.
#
# Exit codes:
#   0 = allow (command proceeds)
#   2 = block (commit denied, stderr fed to Claude)
#
# JSON decision output for PreToolUse:
#   { "hookSpecificOutput": { "permissionDecision": "deny", "permissionDecisionReason": "..." } }
#
# Uses `bun -e` for JSON parsing instead of jq (project convention).

set -euo pipefail

# Read stdin JSON
INPUT=$(cat)

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
  const data = JSON.parse(await Bun.stdin.text());
  const cmd = data.tool_input?.command ?? data.command ?? '';
  process.stdout.write(cmd);
")

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

# Detect runtime: reads .planning/config.json, falls back to command detection
read_runtime() {
  local config="${CLAUDE_PROJECT_DIR:-.}/.planning/config.json"

  # Try reading from config.json
  if [ -f "$config" ]; then
    local rt=""
    set +e
    if command -v bun &>/dev/null; then
      rt=$(HOOK_CFG="$config" bun -e "
        try {
          const cfg = JSON.parse(await Bun.file(process.env.HOOK_CFG).text());
          process.stdout.write(cfg.runtime || '');
        } catch { /* empty */ }
      " 2>/dev/null)
    elif command -v node &>/dev/null; then
      rt=$(HOOK_CFG="$config" node -e "
        try {
          const fs = require('fs');
          const cfg = JSON.parse(fs.readFileSync(process.env.HOOK_CFG, 'utf-8'));
          process.stdout.write(cfg.runtime || '');
        } catch { /* empty */ }
      " 2>/dev/null)
    fi
    set -e

    if [ -n "$rt" ]; then
      echo "$rt"
      return
    fi
  fi

  # Fallback: detect from PATH
  if command -v bun &>/dev/null; then
    echo "bun"
  elif command -v node &>/dev/null; then
    echo "node"
  else
    echo "bun"
  fi
}

RUNTIME=$(read_runtime)

ERRORS=""
HAS_ERRORS=0

# Quality Check 1: Run tests
echo "Running tests before commit..." >&2
set +e
if [ "$RUNTIME" = "bun" ]; then
  TEST_OUTPUT=$(cd "$PROJECT_DIR" && bun test 2>&1)
else
  TEST_OUTPUT=$(cd "$PROJECT_DIR" && npm test 2>&1)
fi
TEST_EXIT=$?
set -e

if [ $TEST_EXIT -ne 0 ]; then
  HAS_ERRORS=1
  # Truncate test output to last 30 lines (most relevant)
  TEST_SUMMARY=$(echo "$TEST_OUTPUT" | tail -30)
  ERRORS="${ERRORS}
## Test Failures
\`\`\`
${TEST_SUMMARY}
\`\`\`
"
fi

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

# All checks passed — allow the commit
exit 0
