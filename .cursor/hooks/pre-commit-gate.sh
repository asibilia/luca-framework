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

# Extract the Bash command being executed
# Claude Code: tool_input.command, Cursor: command (top-level)
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
ERRORS=""
HAS_ERRORS=0

# Quality Check 1: Run tests
echo "Running tests before commit..." >&2
set +e
TEST_OUTPUT=$(cd "$PROJECT_DIR" && bun test 2>&1)
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
  TSC_OUTPUT=$(cd "$PROJECT_DIR" && bunx --bun tsc --noEmit 2>&1)
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
